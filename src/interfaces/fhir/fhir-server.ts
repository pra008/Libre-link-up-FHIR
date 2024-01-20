import {OutgoingHttpHeaders} from "http";


// Define the interface for the AuthTicket object
export interface FhirAuthTicket {
    duration: number;
    expires: number;
    token: string;
  }

export interface FhirHttpHeaders extends OutgoingHttpHeaders {
    Authorization?: string;
  }