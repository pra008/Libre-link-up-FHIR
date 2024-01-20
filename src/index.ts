/**
 * Glucose Data Interoperability Model Test
 * 
 * This file serves as the entry point for the Interoperability Model Test.
 * It contains the main workflow execution, configuration setup, and scheduling logic.
 * 
 * Contents:
 *  - Import statements for required libraries and modules.
 *  - Configuration setup for logger, environment variables, and other dependencies.
 *  - Functions for managing authentication, data retrieval, processing, and uploading to the FHIR server.
 *  - Schedule setup for periodic execution of the main workflow.
 */

// Import necessary libraries and modules
import fs from "fs"
import path from "path";
import dotenv from 'dotenv';
dotenv.config();

import { LLU_API_ENDPOINTS } from "./constants/llu-api-endpoints";
import cron from "node-cron";
import axios, { AxiosResponse } from 'axios';

import { createLogger, transports, format, Logger } from "winston";
import { AuthTicket, Connection } from "./interfaces/librelink/common";
import { Observation } from "./interfaces/fhir/observation";
import { FhirAuthTicket } from "./interfaces/fhir/fhir-server";
import { KeycloakClient, TokenResponseKeycloak } from "./interfaces/keycloak/keycloak"
import { LibreLinkUpHttpHeaders } from "./interfaces/http-headers";
import { filterObservationsByLastFHIRObservationDate, createFormattedMeasurementsFhir, saveBundleToFile, uploadObservationToFHIR, createDeviceResource } from "./fhir/fhirFunctions"
import { getGlucoseMeasurementsConnection, getLibreLinkUpConnection, login } from "./libre/libreFunctions";

const { combine, timestamp, printf } = format;

const logFormat = printf(({ level, message }) => {
    return `[${level}]: ${message}`;
});

export const logger = createLogger({
    format: combine(
        timestamp(),
        logFormat
    ),
    transports: [
        new transports.Console({ level: process.env.LOG_LEVEL || "info" }),
    ]
});

axios.interceptors.response.use(response => {
    return response;
}, error => {
    if (error.response) {
        logger.error("axios:" + JSON.stringify(error.response.data));
    }
    else {
        logger.error("axios:" + error.message);
    }
    return error;
});


const USER_AGENT = "FreeStyle LibreLink Up FHIR Uploader";
/**
 * LibreLink Up Credentials
 */
const LINK_UP_USERNAME = process.env.LINK_UP_USERNAME || "";
const LINK_UP_PASSWORD = process.env.LINK_UP_PASSWORD || "";

/**
 * LibreLink Up API Settings (Don't change this unless you know what you are doing)
 */
const LIBRE_LINK_UP_VERSION = "4.7.0";
const LIBRE_LINK_UP_PRODUCT = "llu.ios";
const LINK_UP_REGION = process.env.LINK_UP_REGION || "EU";
const LIBRE_LINK_UP_URL = getLibreLinkUpUrl(LINK_UP_REGION);

/**
 * DEMO CONSTANT
 * (hardcoded, only for demo purposes)
 * process.env.DEMO_ENABLED===true will make them function
 */
const DEMO_SOURCE_PATH = path.join(__dirname, '../Demo/Data/response_data.json');
const DEMO_DESTINATION_PATH = path.join(__dirname, '../Demo/Data');

/**
 * Keycloak Client Configuration
 * 
 * This constant represents the configuration for interacting with the Keycloak server.
 * It contains the endpoint, client ID, client secret, and scope required for obtaining access tokens.
 * 
 * Structure:
 *  - keycloakEndpoint: The URL endpoint of the Keycloak server for token retrieval.
 *  - clientId: The client ID used for authentication with the Keycloak server.
 *  - clientSecret: The client secret used for authentication with the Keycloak server.
 *  - scope: The scope defining the access permissions granted by the access token.
 * 
 * Note: Environment variables are used to populate these values for secure configuration.
 */
const keycloakClient: KeycloakClient = {
    keycloakEndpoint: process.env.TOKEN_ENDPOINT || '',
    clientId: process.env.CLIENT_ID || '',
    clientSecret: process.env.CLIENT_SECRET || '',
    scope: process.env.SCOPE || '',
};

/**
 * FHIR CONSTANT
 */
const FHIR_ID = process.env.FHIR_ID || "";
const FHIR_URL = process.env.FHIR_URL;

function getFHIRUrl(): string | "" {
    if (!FHIR_URL) {
        logger.error("no FHIR URL")
        return "";
    }
    else {
        return FHIR_URL;
    }

}

/**
 * Get Access Token from Identity Provider (e.g., Keycloak Server)
 * 
 * This function retrieves an access token from the Keycloak server using client credentials.
 * It constructs the necessary request parameters, sends a POST request to the Keycloak token endpoint,
 * and retrieves the access token from the response.
 * 
 * @param config The Keycloak client configuration containing endpoint, client ID, client secret, and scope.
 * @returns A promise that resolves with the obtained access token as a string.
 * 
 * Behavior:
 *  - Constructs the token endpoint URL using the provided Keycloak endpoint.
 *  - Creates request parameters including client credentials and required scope.
 *  - Sends a POST request to the token endpoint using Axios.
 *  - Retrieves the access token from the successful response.
 *  - If an error occurs during the request:
 *    - Logs an error message indicating a non-zero status code.
 *    - Throws the error for handling in the calling function.
 */
async function getToken(config: KeycloakClient): Promise<string> {
    try {
        const { keycloakEndpoint, clientId, clientSecret, scope } = config;

        const tokenEndpoint = `${keycloakEndpoint}`;
        const tokenData = new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: clientId,
            client_secret: clientSecret,
            scope: scope,
        });

        const tokenResponse: AxiosResponse<TokenResponseKeycloak> = await axios.post<TokenResponseKeycloak>(tokenEndpoint, tokenData);

        const accessToken = tokenResponse.data.access_token;
        return accessToken;
    } catch (error) {
        logger.error('LibreLink Up - Non-zero status code', error);
        return "";
    }
}

/**
 * last known authTicket for Libre and FHIR
 */
let authTicket: AuthTicket = { duration: 0, expires: 0, token: "" };

// Define the initial AuthTicket object
let fhirAuthTicket: FhirAuthTicket = {
    duration: 0,
    expires: 0,
    token: "",
};


/**
 * Get LibreLinkUp API Endpoint based on Region
 * 
 * This function retrieves the corresponding LibreLinkUp API endpoint based on the provided region.
 * It checks if the region exists in LLU_API_ENDPOINTS object and returns the associated endpoint.
 * If the region is not found, it defaults to the EU (Europe) endpoint.
 * 
 * @param region The region for which the API endpoint is to be retrieved.
 * @returns The LibreLinkUp API endpoint URL based on the provided region.
 * 
 * Behavior:
 *  - Checks if the provided region exists in the LLU_API_ENDPOINTS object.
 *  - If the region exists:
 *    - Retrieves and returns the corresponding LibreLinkUp API endpoint.
 *  - If the region doesn't exist or is invalid:
 *    - Defaults to the EU (Europe) endpoint from LLU_API_ENDPOINTS object.
 */
function getLibreLinkUpUrl(region: string): string {
    if (LLU_API_ENDPOINTS.hasOwnProperty(region)) {
        return LLU_API_ENDPOINTS[region];
    }
    return LLU_API_ENDPOINTS.EU;
}


const libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders = {
    "User-Agent": USER_AGENT,
    "Content-Type": "application/json",
    "version": LIBRE_LINK_UP_VERSION,
    "product": LIBRE_LINK_UP_PRODUCT,
    "Accept-Encoding": "gzip, deflate, br",
    "Connection": "keep-alive",
    "Pragma": "no-cache",
    "Cache-Control": "no-cache",
    "Authorization": undefined
}


/**
 * Demo Version Runner
 * 
 * This function runs the demo version of a specific process or functionality.
 * It reads data from a specified JSON file, converts it into FHIR-formatted observations,
 * and saves the formatted observations as a FHIR bundle to a specified destination.
 * 
 * @returns A promise that resolves once the demo version is executed.
 * 
 * Behavior:
 *  - Logs a debug message indicating the start of the demo version.
 *  - Attempts to read JSON data from the file specified by `DEMO_SOURCE_PATH`.
 *  - If successful in reading the JSON data:
 *    - Calls the `createFormattedMeasurementsFhir()` function to convert the parsed JSON data
 *      into FHIR-formatted observations, providing `FHIR_ID`, `jsonData`, and `"Tester"` as parameters.
 *    - If the conversion is successful:
 *      - Calls the `saveBundleToFHIR()` function to save the obtained FHIR-formatted observations
 *        as a bundle to the file specified by `DEMO_DESTINATION_PATH`.
 *    - If any errors occur during file reading, JSON parsing, data conversion, or saving:
 *      - Logs an error message indicating the specific error that occurred.
 */

const runDemoVersion = async (): Promise<void> => {
    try {
        logger.debug("Running the Demo version"); // Log a debug message indicating the start of the demo version
        // Read JSON data from the specified file path containing demo data
        const jsonData = JSON.parse(fs.readFileSync(DEMO_SOURCE_PATH, 'utf-8'));
        // Convert the parsed JSON data into FHIR-formatted observations
        const formattedObservation: Observation[] = await createFormattedMeasurementsFhir(FHIR_ID, jsonData, "Tester");
        // Save the formatted observations as a FHIR bundle to the specified destination
        await saveBundleToFile(DEMO_DESTINATION_PATH, formattedObservation);
    } catch (error) {
        // Handle errors that may occur during file reading, JSON parsing, or data conversion
        console.error('Error reading file or processing data:', error);
    }
};

// Check if the demo is enabled in the environment variable
if (process.env.DEMO_ENABLED === "true") {
    logger.info("Demo enabled")
    runDemoVersion().then(); // Run the demo version
} else {
    // Your existing code for running the scheduled or main version
    if (process.env.SINGLE_SHOT === "true") {
        logger.info("Running only once")
        main().then();
    } else {
        logger.info("process.env.DEMO_ENABLED: " + process.env.DEMO_ENABLED);
        const schedule = "*/" + (process.env.LINK_UP_TIME_INTERVAL || 1) + " * * * *";
        logger.info("Starting cron schedule: " + schedule);
        cron.schedule(schedule, () => {
            main().then();
        }, {});
    }
}

/**
 * Main Workflow Execution
 * 
 * This function represents the main workflow execution of the application.
 * It involves various steps such as authentication, data retrieval, data processing,
 * and uploading the processed data to the FHIR server.
 * 
 * @returns A promise that resolves once the main workflow is completed.
 * 
 * Behavior:
 *  - Retrieves the FHIR server URL using the `getFHIRUrl()` function.
 *  - Checks if the current authentication tokens are valid using the `hasValidAuthentication()` function.
 *  - If authentication tokens are invalid:
 *    - Logs information indicating the need to renew tokens.
 *    - Deletes existing AuthTicket and FHIR authentication ticket.
 *    - Attempts to obtain a new AuthTicket by calling the `login()` function with specified credentials.
 *    - If obtaining the AuthTicket fails:
 *      - Logs an error message and returns from the function.
 *    - Updates the AuthTicket with the new one obtained from the login process.
 *    - Retrieves glucose measurements data using the `getGlucoseMeasurements()` function.
 *    - If glucose measurements data is available:
 *      - Converts the data into FHIR-formatted observations using the `createFormattedMeasurementsFhir()` function.
 *      - Obtains an access token from the FHIR server using the `getToken()` function.
 *      - Logs the received access token from the FHIR server.
 *      - Retrieves the last entry date from the FHIR server using the `lastFHIRObservation()` function.
 *      - Logs the last value obtained from the FHIR server.
 *      - Uploads the formatted observations to the FHIR server using the `uploadObservationToFHIR()` function.
 *    - If any errors occur during the process:
 *      - Logs debug information regarding the encountered error.
 */
async function main(): Promise<void> {
    // Obtain an access token from the FHIR server
    const accessToken = await getToken(keycloakClient);
    // Retrieve the FHIR server URL
    const fhir_url = getFHIRUrl();
    let fhir_active = false;

    if (accessToken != undefined && accessToken != "") {
        logger.info("Access Token from FHIR server received");
        logger.info(accessToken.slice(0, 10) + "...");
        fhir_active = true;
    } else {
        fhir_active = false;
    }

    if (!hasValidAuthentication()) {
        // Handle invalid authentication tokens
        logger.info("renew token");
        // Delete existing AuthTicket and FHIR authentication ticket
        deleteAuthTicket();
        deleteFhirAuthTicket();
        // Obtain a new AuthTicket by logging in with specified credentials
        const authTicket: AuthTicket | null = await login(LINK_UP_USERNAME, LINK_UP_PASSWORD, LIBRE_LINK_UP_URL, libreLinkUpHttpHeaders);

        if (!authTicket) {
            // If obtaining AuthTicket fails, log error and return
            logger.error("LibreLink Up - No AuthTicket received. Please check your credentials.");
            deleteAuthTicket();
            deleteFhirAuthTicket();
            return;
        }

        // Update AuthTicket with the new one obtained from the login process
        logger.info("Got the following Access Token from Libre Server" + authTicket.token.slice(0, 10) + "...");
        updateAuthTicket(authTicket);

        // Retrive all the patient connections
        // there is a limit of 15 patients reamemebr that
        const connections: Connection[] | null = await getLibreLinkUpConnection(libreLinkUpHttpHeaders, LIBRE_LINK_UP_URL, authTicket);

        if (connections !== null) {
            // Iterate through each connection
            for (const connection of connections) {

                const subjectName = connection.firstName + " " + connection.lastName;
                const patientId = connection.patientId;
                const fhir_id = patientId;

                //fetch data
                const { gdata: glucoseGraphData } = await getGlucoseMeasurementsConnection(libreLinkUpHttpHeaders, LIBRE_LINK_UP_URL, authTicket, patientId);

                if (!glucoseGraphData) {
                    // If no glucose measurements data found, log and return
                    logger.info("no data found for: " + patientId);

                } else {
                    const deviceResource = createDeviceResource(connection);
                    
                    if (fhir_active) {
                        const formattedObservation: Observation[] = await filterObservationsByLastFHIRObservationDate(fhir_url, accessToken, fhir_id, patientId, glucoseGraphData, subjectName);
                        // Upload formatted observations to the FHIR server
                        logger.info("Trying to Upload data to FHIR");
                        await uploadObservationToFHIR(fhir_url, formattedObservation, accessToken);
                    }
                    else {
                        const formattedObservation: Observation[] = await createFormattedMeasurementsFhir(FHIR_ID, glucoseGraphData, subjectName);
                        // Save the formatted observations as a FHIR bundle to the specified destination
                        await saveBundleToFile(DEMO_DESTINATION_PATH, formattedObservation);
                    }
                }
            }
        }
    }
}



/**
 * Deletes the authentication token.
 * 
 * Behavior: This function removes the authentication ticket, clearing any existing
 * credentials or tokens.
 */
function deleteAuthTicket(): void {
    authTicket = { duration: 0, expires: 0, token: "" };
}

/**
 * Updates the authentication token with a new value.
 * 
 * @param newAuthTicket - The new authentication token.
 * 
 * Behavior: This function updates the authentication token with a new value,
 * replacing the existing token.
 */
function updateAuthTicket(newAuthTicket: AuthTicket): void {
    authTicket = newAuthTicket;
}

/**
 * Checks if the authentication is valid.
 * 
 * @returns A boolean indicating if the authentication is valid or not.
 * 
 * Behavior: This function checks if the authentication is valid by comparing the
 * expiration time of the authentication ticket with the current time. It returns
 * true if the authentication is still valid, and false otherwise.
 */
function hasValidAuthentication(): boolean {
    if (authTicket.expires !== undefined) {
        const currentDate = Math.round(new Date().getTime() / 1000);
        return currentDate < authTicket.expires;
    }

    logger.info("no authTicket.expires");

    return false;
}

/**
 * Function to delete the FHIR authentication ticket.
 * 
 * Behavior: This function deletes the FHIR authentication ticket, clearing any existing
 * credentials or tokens associated with it.
 */
function deleteFhirAuthTicket(): void {
    fhirAuthTicket = {
        duration: 0,
        expires: 0,
        token: "",
    };
}
