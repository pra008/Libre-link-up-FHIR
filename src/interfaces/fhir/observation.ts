export interface Observation {
    resourceType: string;
    id: string;
    text: {
      status: string;
      div: string;
    };
    identifier: {
      use: string;
      system: string;
      value: string;
    }[];
    status: string;
    effectiveDateTime: string;
    code: {
      coding: {
        system: string;
        code: string;
        display: string;
      }[];
    };
    subject: Subject;
    issued: string;
    performer: Subject[];
    valueQuantity: {
      value: number;
      unit: string;
      system: string;
      code: string;
    };
    referenceRange: {
      low: {
        value: number;
        unit: string;
        system: string;
        code: string;
      };
      high: {
        value: number;
        unit: string;
        system: string;
        code: string;
      };
    }[];
  }


export interface Subject {
  reference: string;
  display: string;
}

export interface FhirDeviceResource {
  resourceType: 'Device';
  id: string;
  status: string;

  subject: Subject;
  serialNumber: string;

  identifier?: {
      system: string;
      value: string;
  }[];

  type?: {
      coding?: {
          system: string;
          code: string;
          display?: string;
      }[];
      text?: string;
  };
  manufacturer?: string;
  model?: string;
}


