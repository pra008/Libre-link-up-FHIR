import axios, { AxiosResponse } from "axios";
import { logger } from "../index";
import { FhirHttpHeaders } from "../interfaces/http-headers";
import { GlucoseScaleMG, GlucoseScaleMMOL, LOINC_CODES, UNIT_CODES } from "../constants/fhir-values";
import { FhirDeviceResource, Observation } from "../interfaces/fhir/observation";
import { v4 as uuidv4 } from 'uuid'; // generate a unique identifier for the id field
import { getUtcDateFromString } from "../helpers/helpers";
import { GraphData } from "../interfaces/librelink/graph-response";
import { Connection, GlucoseItem } from "../interfaces/librelink/common";
import { OutgoingHttpHeaders } from "http";
import fs from 'fs'

// Set the headers
export async function lastFHIRObservation(fhir_url: string, accessToken: string, patientId: string): Promise<Date | null> {

    // Construct the FHIR query URL
    const queryUrl = `${fhir_url}/Observation?patient=${patientId}&_sort=-date&_count=1`;

    const expectedCode = {
        system: GlucoseScaleMMOL.SYSTEM,
        code: LOINC_CODES.GLUCOSE_MOLES_VOLUME_BLOOD,
    };

    // Construct the query string with code match criteria
    const queryString = `code=${expectedCode.system}|${expectedCode.code}`;

    // Append this queryString to the original queryUrl
    const queryUrlWithCodeMatch = `${queryUrl}&${queryString}`;

    // Set the headers
    const headers: FhirHttpHeaders = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
    };

    // Send the request to the FHIR server
    try {
        // Send the request to the FHIR server
        const response: AxiosResponse = await axios.get(queryUrlWithCodeMatch, { headers });
        if (response.data && response.data.entry && response.data.entry.length > 0) {

            // Extract the latest Observation from the Bundle
            const latestObservation = response.data.entry[0].resource;
            // Extract the date from the latest Observation
            const date = new Date(latestObservation.effectiveDateTime);
            return date;

        } else {
            logger.warn('Response data does not contain expected "entry" structure.');
            if (!response.data || response.data.length === 0) {
                logger.info("Patient never upload data previously")

            }
            return null;
        }
    } catch (error) {
        logger.error('Error occurred while fetching data:', error);
        // Handle the error, log or throw as necessary
        return null
    }

}

/**
 * FHIR extension for create obervation
 */
const createObservation = (fhir_id: string, date: string, value: number, subjectName: string | null = ''): Observation => {
    const observation: Observation = {
        resourceType: 'Observation',
        id: uuidv4(),
        text: {
            status: 'empty',
            div: '<div xmlns="http://www.w3.org/1999/xhtml"><p><b>Generated Narrative with Details TODO</b></p></div>',
        },
        identifier: [
            {
                use: 'official',
                system: 'http://www.bmc.nl/zorgportal/identifiers/observations',
                value: '6323',
            },
        ],
        status: 'final',
        effectiveDateTime: date,
        code: {
            coding: [
                {
                    system: GlucoseScaleMMOL.SYSTEM,
                    code: LOINC_CODES.GLUCOSE_MOLES_VOLUME_BLOOD,
                    display: GlucoseScaleMMOL.DISPLAY,
                },
            ],
        },
        subject: {
            reference: `Patient/${fhir_id}`,
            display: subjectName || '',
        },
        issued: date,
        valueQuantity: {
            value: value,
            unit: GlucoseScaleMG.SCALE,
            system: 'http://unitsofmeasure.org',
            code: GlucoseScaleMG.CODE,
        },
        referenceRange: [
            {
                low: {
                    value: 70,
                    unit: UNIT_CODES.MG_DL,
                    system: 'http://unitsofmeasure.org',
                    code: UNIT_CODES.MG_DL,
                },
                high: {
                    value: 180,
                    unit: UNIT_CODES.MG_DL,
                    system: 'http://unitsofmeasure.org',
                    code: UNIT_CODES.MG_DL,
                },
            },
        ],
        performer: [
            {
                reference: `Patient/${fhir_id}`,
                display: subjectName || '',
            },
        ],
    };

    if (subjectName !== null && subjectName !== '') {
        observation.subject = {
            reference: `Patient/${fhir_id}`,
            display: subjectName,
        };
        observation.performer[0].reference = `Patient/${fhir_id}`;
        observation.performer[0].display = subjectName;
    }

    return observation;
};


export async function createDeviceResource(connection: Connection): Promise<FhirDeviceResource> {
    const name = connection.firstName + " " + connection.lastName;
    let status = connection.status === 2 ? 'active' : 'inactive';
    const deviceResource: FhirDeviceResource = {
        resourceType: 'Device',
        id: uuidv4(),
        status: status, // Set appropriate device status
        manufacturer: 'Abbott ', // Set manufacturer information
        model: 'FreeStyle Libre',
        subject: {
            reference: `Patient/${connection.patientId}`,
            display: name
        },
        serialNumber: `${connection.sensor.sn}`,
    };

    //const deviceResourceJSON = JSON.stringify(deviceResource, null, 2); // The second argument provides spacing for readability
    //logger.info('Device Resource JSON:'+ deviceResourceJSON);

    return deviceResource;
}


export async function createFormattedMeasurementsFhir(fhir_id: string, measurementData: GraphData, subjectName: string | null,): Promise<Observation[]> {
    const formattedMeasurements: Observation[] = [];

    const glucoseMeasurement = measurementData.connection.glucoseMeasurement;

    measurementData.graphData.forEach((glucoseMeasurementHistoryEntry: GlucoseItem) => {
        const entryDate = getUtcDateFromString(glucoseMeasurementHistoryEntry.FactoryTimestamp);
        const observation: Observation = createObservation(fhir_id, entryDate.toISOString(), glucoseMeasurementHistoryEntry.ValueInMgPerDl, subjectName);
        formattedMeasurements.push(observation);
    });

    return formattedMeasurements;
}

export async function filterObservationsByLastFHIRObservationDate(fhir_url: string, accessToken: string, patientId: string, fhir_id: string, measurementData: GraphData, subjectName: string | null): Promise<Observation[]> {
    // Get the date of the last FHIR observation
    const lastFhirObservationDate = await lastFHIRObservation(fhir_url, accessToken, patientId);

    if (lastFhirObservationDate !== null) {
        // Filter out observations before the last FHIR observation date
        const formattedMeasurements = await createFormattedMeasurementsFhir(fhir_id, measurementData, subjectName);
        const filteredObservations = formattedMeasurements.filter((observation) => {
            const observationDate = new Date(observation.effectiveDateTime); // Assuming Observation has a 'effectiveDateTime' property
            return observationDate >= lastFhirObservationDate;
        });

        return filteredObservations;
    } else {
        // Handle the case where lastFHIRObservation returned null or encountered an error
        // For example, you might return all observations if there was an issue fetching the last FHIR observation date
        return await createFormattedMeasurementsFhir(fhir_id, measurementData, subjectName);
    }
}

// Function to create a FHIR bundle from formatted measurements
export function createFHIRBundleObservation(formattedMeasurements: Observation[]): any {
    return {
        resourceType: 'Bundle',
        type: 'transaction',
        entry: formattedMeasurements.map(observation => ({
            fullUrl: `Observation/${observation.id}`,
            resource: observation,
            request: {
                method: 'POST',
                url: 'Observation',
            },
        })),
    };
}

// Updated uploadToFHIR function utilizing createFHIRBundleObservation
export async function uploadObservationToFHIR(fhir_url: string, formattedMeasurements: Observation[], token: string): Promise<void> {
    if (formattedMeasurements.length > 0) {
        try {
            const FHIRheaders: OutgoingHttpHeaders = {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${token}`,
            };

            const dataBundle = createFHIRBundleObservation(formattedMeasurements); // Create FHIR bundle

            const response = await axios.post(
                fhir_url,
                dataBundle,
                {
                    headers: FHIRheaders,
                }
            );

            if (response.status !== 200) {
                logger.error("Upload to FHIR failed ", response.statusText);
            } else {
                logger.info("Upload of " + formattedMeasurements.length + " measurements to FHIR SERVER succeeded");
            }
        } catch (error) {
            logger.error("Upload to FHIR SERVER failed ", error);
        }
    } else {
        logger.info("No new measurements to upload");
    }
}


export async function saveBundleToFile(folderPath: string, formattedMeasurements: Observation[]): Promise<void> {

    logger.info("Get the following observation from File");
    logger.info(formattedMeasurements.length);

    if (formattedMeasurements.length > 0) {

        try {
            const dataBundle = createFHIRBundleObservation(formattedMeasurements); // Create FHIR bundle

            // Get current date and time for file name
            const currentDate = new Date().toISOString().replace(/:/g, '-'); // Format date and time for filename

            // Define folder path and file path with current date and time
            const filePath = `${folderPath}/fhir_bundle_${currentDate}.json`; // Specify the file path with date and time

            // Create the directory if it doesn't exist
            if (!fs.existsSync(folderPath)) {
                fs.mkdirSync(folderPath, { recursive: true });
            }

            // Write the FHIR bundle to the file
            fs.writeFileSync(filePath, JSON.stringify(dataBundle, null, 2), 'utf-8');
            logger.info("Data saved at: " + filePath);


        } catch (error) {
            logger.error("Upload to File failed ", error);
        }
    } else {
        logger.info("No new measurements to upload");
    }
}


