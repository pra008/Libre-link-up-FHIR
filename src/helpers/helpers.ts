/**
 * Helper Functions
 *
 * SPDX-License-Identifier: MIT
 */

export function getUtcDateFromString(timeStamp: string): Date
{
    const utcDate = new Date(timeStamp);
    utcDate.setTime(utcDate.getTime() - utcDate.getTimezoneOffset() * 60 * 1000);
    return utcDate;
}
