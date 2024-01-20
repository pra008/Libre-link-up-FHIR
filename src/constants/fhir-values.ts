export enum LOINC_CODES {
    GLUCOSE_MOLES_VOLUME_BLOOD = '14745-4',
    // Add other LOINC codes as needed
}

export enum UNIT_CODES {
    MG_DL = 'mg/dL',
    // Add other unit codes as needed
}

export const GlucoseScaleMMOL = {
    SCALE: 'mmol/L',
    SYSTEM: 'http://loinc.org',
    CODE: '14749-6',
    DISPLAY: 'Glucose [Moles/volume] in Blood',
};

export const GlucoseScaleMG = {
    SCALE: 'mg/dL',
    SYSTEM: 'http://loinc.org',
    CODE: '2339-0',
    DISPLAY: 'Glucose [Mass/volume] in Blood',
};

export const CGM_GLUCOSE = {
    SYSTEM: 'http://loinc.org',
    CODE: '14745-4',
    DISPLAY: 'Glucose in Capillary blood by Continuous Glucose Monitoring',
};
