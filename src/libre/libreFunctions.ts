import axios from "axios";
import { logger } from "../index";
import { LoginResponse } from "../interfaces/librelink/login-response";
import { LibreLinkUpHttpHeaders } from "../interfaces/http-headers";
import { AuthTicket, Connection } from "../interfaces/librelink/common";
import { GraphData, GraphResponse } from "../interfaces/librelink/graph-response";
import { ConnectionsResponse } from "../interfaces/librelink/connections-response";

import fs from 'fs'; // Import the Node.js file system module
import { log } from "console";

export async function login(link_up_username: string, link_up_password: string, libre_link_up_url: string, libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders): Promise<AuthTicket | null> {
    try {
        const url = "https://" + libre_link_up_url + "/llu/auth/login"
        const response: { data: LoginResponse } = await axios.post(
            url,
            {
                email: link_up_username,
                password: link_up_password,
            },
            {
                headers: libreLinkUpHttpHeaders
            });

        try {
            if (response.data.status !== 0) {
                logger.error(`LibreLink Up - Non-zero status code: ${JSON.stringify(response.data)}`)
                return null;
            }
            if (response.data.data.redirect === true && response.data.data.region) {
                const correctRegion = response.data.data.region.toUpperCase();
                logger.error(
                    `LibreLink Up - Logged in to the wrong region. Switch to '${correctRegion}' region.`
                );
                return null;
            }
            logger.info("Logged in to LibreLink Up");
            return response.data.data.authTicket;
        } catch (err) {
            logger.error("Invalid authentication token. Please check your LibreLink Up credentials", err);
            return null;
        }
    } catch (error) {
        logger.error("Invalid credentials", error);
        return null;
    }
}


export async function getGlucoseMeasurementsConnection(libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders, libre_link_up_url: string, authTicket: AuthTicket, connectionId: string): Promise<{ gdata: GraphData | null }> {
    if (!connectionId) {
        return { gdata: null };
    }
    else {
        try {
            const url = "https://" + libre_link_up_url + "/llu/connections/" + connectionId + "/graph"
            const response: { data: GraphResponse } = await axios.get(
                url,
                {
                    headers: getLluAuthHeaders(libreLinkUpHttpHeaders, authTicket)
                });
            return { gdata: response.data.data };
        }
        catch (error) {
            logger.error("Error getting glucose measurements", error);
            return { gdata: null };
        }

    }
}

/* export async function getGlucoseMeasurements(libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders, libre_link_up_url: string, authTicket: AuthTicket): Promise<{ gdata: GraphData | null; subjectName: string | null }> {
    try {
        const result = await getLibreLinkUpConnection(libreLinkUpHttpHeaders, libre_link_up_url, authTicket);


        if (result !== null) {
            const [connectionId, subjectName] = result;
            if (!connectionId) {
                return { gdata: null, subjectName: null };
            }

            const url = "https://" + libre_link_up_url + "/llu/connections/" + connectionId + "/graph"
            const response: { data: GraphResponse } = await axios.get(
                url,
                {
                    headers: getLluAuthHeaders(libreLinkUpHttpHeaders, authTicket)
                });

            return { gdata: response.data.data, subjectName: subjectName };

        } else {
            return { gdata: null, subjectName: null };
        }
    } catch (error) {
        logger.error("Error getting glucose measurements", error);
        return { gdata: null, subjectName: null };
    }
} */

export async function getLibreLinkUpConnection(libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders, libre_link_up_url: string, authTicket: AuthTicket): Promise<Connection[] | null> {
    try {
        const url = "https://" + libre_link_up_url + "/llu/connections";
        const response: { data: ConnectionsResponse } = await axios.get(
            url,
            {
                headers: getLluAuthHeaders(libreLinkUpHttpHeaders, authTicket)
            });

        const connectionData = response.data.data;
        dumpConnectionData(connectionData);

        if (connectionData.length === 0) {
            logger.error("No LibreLink Up connections found");
            return null;
        }

        return connectionData;

    } catch (error) {
        logger.error("Error getting LibreLink Up connections: ", error);
        return null;
    }
}

function dumpConnectionData(connectionData: Connection[]): void {
    logger.debug("Found " + connectionData.length + " LibreLink Up connections:");
    connectionData.map((connectionEntry: Connection, index: number) => {
        logger.debug("[" + (index + 1) + "] " + connectionEntry.firstName + " " + connectionEntry.lastName + " (Patient-ID: " +
            connectionEntry.patientId + ")");
        logConnectionInfo(connectionEntry);
    });
}


function getLluAuthHeaders(libreLinkUpHttpHeaders: LibreLinkUpHttpHeaders, authTicket: AuthTicket): LibreLinkUpHttpHeaders {
    const authenticatedHttpHeaders = libreLinkUpHttpHeaders;
    authenticatedHttpHeaders.Authorization = "Bearer " + authTicket.token;
    logger.debug("authenticatedHttpHeaders: " + JSON.stringify(authenticatedHttpHeaders));
    return authenticatedHttpHeaders;
}

function logPickedUpConnection(connection: Connection): void {

    logger.info(
        "-> The following connection will be used: " + connection.firstName + " " + connection.lastName + " (Patient-ID: " +
        connection.patientId + ")");

    logConnectionInfo(connection);
}


function logConnectionInfo(connection: Connection): void {
    logger.info('Connection Info:');
    logger.info(`- id: ${connection.id}`);
    logger.info(`- patientId: ${connection.patientId}`);
    logger.info(`- country: ${connection.country}`);
    logger.info(`- status: ${connection.status}`);
    logger.info(`- firstName: ${connection.firstName}`);
    logger.info(`- lastName: ${connection.lastName}`);

/*     logger.info(`- targetLow: ${connection.targetLow}`);
    logger.info(`- targetHigh: ${connection.targetHigh}`);
    logger.info(`- uom: ${connection.uom}`); */

    logger.info('Sensor:');
    logger.info(`- deviceId: ${connection.sensor.deviceId}`);
    logger.info(`- sn: ${connection.sensor.sn}`);
    logger.info(`- a: ${connection.sensor.a}` + "(Maybe timestamp when installed or become functional");
/* 
    logger.info(`- w: ${connection.sensor.w}`);
    logger.info(`- pt: ${connection.sensor.pt}`);
    logger.info(`- s: ${connection.sensor.s}`);
    logger.info(`- lj: ${connection.sensor.lj}`);

    logger.info('Alarm Rules:');
    logger.info(`- c: ${connection.alarmRules.c}`);

    logger.info('High Alarm Rules:');
    logger.info(`- th: ${connection.alarmRules.h.th}`);
    logger.info(`- thmm: ${connection.alarmRules.h.thmm}`);
    logger.info(`- d: ${connection.alarmRules.h.d}`);
    logger.info(`- f: ${connection.alarmRules.h.f}`);

    logger.info('Fixed High Alarm Rules:');
    logger.info(`- th: ${connection.alarmRules.f.th}`);
    logger.info(`- thmm: ${connection.alarmRules.f.thmm}`);
    logger.info(`- d: ${connection.alarmRules.f.d}`);
    logger.info(`- tl: ${connection.alarmRules.f.tl}`);
    logger.info(`- tlmm: ${connection.alarmRules.f.tlmm}`);

    logger.info('Low Alarm Rules:');
    logger.info(`- th: ${connection.alarmRules.l.th}`);
    logger.info(`- thmm: ${connection.alarmRules.l.thmm}`);
    logger.info(`- d: ${connection.alarmRules.l.d}`);
    logger.info(`- tl: ${connection.alarmRules.l.tl}`);
    logger.info(`- tlmm: ${connection.alarmRules.l.tlmm}`);

    logger.info('Non-Delivery Alarm Rules:');
    logger.info(`- i: ${connection.alarmRules.nd.i}`);
    logger.info(`- r: ${connection.alarmRules.nd.r}`);
    logger.info(`- l: ${connection.alarmRules.nd.l}`);

    logger.info(`- p: ${connection.alarmRules.p}`);
    logger.info(`- r: ${connection.alarmRules.r}`); */
}