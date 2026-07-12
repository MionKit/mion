/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Format name constants — the ts-runtypes format ids (TypeFormat 2nd type argument). */
export const FormatNames = {
    // String formats
    stringFormat: 'stringFormat',
    uuid: 'uuid',
    email: 'email',
    url: 'url',
    domain: 'domain',
    ip: 'ip',
    date: 'date',
    time: 'time',
    dateTime: 'dateTime',
    // Number formats
    numberFormat: 'numberFormat',
    // BigInt formats
    bigintFormat: 'bigintFormat',
} as const;

export type FormatName = (typeof FormatNames)[keyof typeof FormatNames];
