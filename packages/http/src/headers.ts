/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderValue, MionHeaders, headersFromRecord} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';

export function headersFromIncomingMessage(rawRequest: IncomingMessage): MionHeaders {
    // IncomingMessage headers already in lowercase or case insensitive so no need to transform
    const initToLowercase = false;
    return headersFromRecord(rawRequest.headers as Record<string, HeaderValue>, initToLowercase);
}

export function headersFromServerResponse(resp: ServerResponse, initialHeaders: Record<string, HeaderValue> | null): MionHeaders {
    if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => resp.setHeader(name, value));
    return {
        append: (name: string, value: HeaderValue) => resp.appendHeader(name.toLowerCase(), value as any as string | string[]),
        delete: (name: string) => resp.removeHeader(name.toLowerCase()),
        get: (name: string) => resp.getHeader(name.toLowerCase()) as HeaderValue,
        has: (name: string) => resp.hasHeader(name.toLowerCase()),
        set: (name: string, value: HeaderValue) => resp.setHeader(name.toLowerCase(), value),
        entries: () => new Map(Object.entries(resp.getHeaders() as Record<string, HeaderValue>)).entries(),
        keys: () => new Set(resp.getHeaderNames()).values(),
        values: () => new Set(Object.values(resp.getHeaders() as Record<string, HeaderValue>)).values(),
    };
}
