/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MultiHeaderValue, MionHeaders, headersFromRecord, SingleHeaderValue} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';

export function headersFromIncomingMessage(rawRequest: IncomingMessage): MionHeaders {
    return headersFromRecord(rawRequest.headers as Record<string, SingleHeaderValue>);
}

export function headersFromServerResponse(
    resp: ServerResponse,
    initialHeaders: Record<string, SingleHeaderValue> | null
): MionHeaders {
    if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => resp.setHeader(name, value));
    return {
        append: (name: string, value: MultiHeaderValue) => resp.appendHeader(name, value),
        delete: (name: string) => resp.removeHeader(name),
        get: (name: string) => {
            const value = resp.getHeader(name);
            if (Array.isArray(value)) return value.join(', ');
            return value as SingleHeaderValue;
        },
        has: (name: string) => resp.hasHeader(name),
        set: (name: string, value: MultiHeaderValue) => resp.setHeader(name, value),
        entries: () => getSingleHeadersObj(resp).entries(),
        keys: () => new Set(resp.getHeaderNames()).values(),
        values: () => getSingleHeadersObj(resp).values(),
    };
}

function getSingleHeadersObj(resp: ServerResponse) {
    const entries = Object.entries(resp.getHeaders()).map(([name, value]) => [
        name,
        Array.isArray(value) ? value.join(', ') : (value as SingleHeaderValue),
    ]);
    return Object.fromEntries(entries);
}
