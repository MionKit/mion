/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MultiHeaderValue, MionHeaders, headersFromRecord, SingleHeaderValue} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';

export function headersFromIncomingMessage(rawRequest: IncomingMessage): MionHeaders {
    return headersFromRecord(rawRequest.headers as any, true);
}

export function headersFromServerResponse(
    resp: ServerResponse,
    initialHeaders: Record<string, MultiHeaderValue> | null
): MionHeaders {
    if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => resp.setHeader(name, value));
    return {
        append: (name: string, value: MultiHeaderValue) => resp.appendHeader(name, value),
        delete: (name: string) => resp.removeHeader(name),
        get: (name: string) => toSingleHeader(resp.getHeader(name)),
        has: (name: string) => resp.hasHeader(name),
        set: (name: string, value: MultiHeaderValue) => resp.setHeader(name, value),
        entries: () => getSingleHeadersObj(resp).entries(),
        keys: () => getSingleHeadersObj(resp).values(),
        values: () => getSingleHeadersObj(resp).values(),
    } satisfies MionHeaders;
}

function toSingleHeader(value: string | number | string[] | undefined): SingleHeaderValue | undefined {
    if (!value) return undefined;
    if (Array.isArray(value)) return value.join(', ');
    return value as string;
}

function getSingleHeadersObj(resp: ServerResponse) {
    const entries = Object.entries(resp.getHeaders()).map(([name, value]) => [name, toSingleHeader(value)]);
    return Object.fromEntries(entries);
}
