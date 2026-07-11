/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fromBase64Url, SerializerModes} from '@mionjs/core';
import type {SerializerCode} from '@mionjs/core';

/** Result of decoding a base64url query body from ?data= */
export interface QueryBodyResult {
    rawBody: string;
    bodyType: SerializerCode;
}

/** Detects and decodes base64url-encoded request body from ?data= query param.
 * Returns decoded body + bodyType if found, undefined otherwise. */
export function decodeQueryBody(urlQuery: string | undefined, rawBody: unknown): QueryBodyResult | undefined {
    if (rawBody) return undefined;
    if (!urlQuery) return undefined;
    const dataValue = extractDataParam(urlQuery);
    if (!dataValue) return undefined;
    return {
        rawBody: fromBase64Url(dataValue),
        bodyType: SerializerModes.stringifyJson,
    };
}

function extractDataParam(urlQuery: string): string | undefined {
    if (urlQuery.startsWith('data=')) {
        const ampIndex = urlQuery.indexOf('&', 5);
        return ampIndex === -1 ? urlQuery.slice(5) : urlQuery.slice(5, ampIndex);
    }
    const idx = urlQuery.indexOf('&data=');
    if (idx === -1) return undefined;
    const start = idx + 6;
    const ampIndex = urlQuery.indexOf('&', start);
    return ampIndex === -1 ? urlQuery.slice(start) : urlQuery.slice(start, ampIndex);
}
