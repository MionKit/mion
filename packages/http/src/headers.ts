/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersRecord, MultiHeader, headersFromRecord} from '@mionkit/router';
import {IncomingMessage, ServerResponse} from 'http';

/**
 * Return a Headers Like object from an IncomingMessage object
 * Returned Headers object is similar to the fetch Headers object but not exactly the same
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 *
 * This is optimized so is using IncomingMessage headers under the hood.
 * @param rawRequest
 * @returns
 */
export function headersFromIncomingMessage(rawRequest: IncomingMessage): Headers {
    return headersFromRecord(rawRequest.headers as HeadersRecord);
}

/**
 * Return a Headers Like object from an OutgoingMessage object
 * Returned Headers object is similar to the fetch Headers object but not exactly the same
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 *
 * This is optimized so is using OutgoingMessage headers under the hood but adapting to the Headers interface
 *
 * @param resp
 * @param initialHeaders
 * @returns
 */
export function headersFromServerResponse(resp: ServerResponse, initialHeaders?: HeadersRecord): Headers {
    if (initialHeaders) Object.entries(initialHeaders).forEach(([name, value]) => resp.setHeader(name, value));

    const mionHeaders = {
        append: (name: string, value: MultiHeader) => {
            const ln = name.toLowerCase();
            if (ln === 'set-cookie') return resp.appendHeader('Set-Cookie', value);
            const stValue: string = Array.isArray(value) ? value.join(', ') : value;
            const existing = resp.getHeader(name);
            const existingStValue = Array.isArray(existing) ? existing.join(', ') : existing;
            resp.setHeader(name, existingStValue ? `${existingStValue}, ${stValue}` : stValue);
        },
        delete: (name: string) => resp.removeHeader(name),
        get: (name: string) => {
            const value = resp.getHeader(name);
            if (Array.isArray(value)) return value.join(', ');
            return value as string;
        },
        set: (name: string, value: MultiHeader) => {
            const ln = name.toLowerCase();
            if (ln === 'set-cookie') return resp.setHeader('Set-Cookie', value);
            const stValue: string = Array.isArray(value) ? value.join(', ') : value;
            resp.setHeader(name, stValue);
        },
        has: (name: string) => resp.hasHeader(name),
        entries: () => {
            const parsed: [string, string][] = Object.entries(resp.getHeaders())
                .filter(([name, value]) => !!value && !!name)
                .map(([name, value]) => [name, Array.isArray(value) ? value.join(', ') : (value as string)]);
            return parsed.values();
        },
        keys: () => {
            const parsed: string[] = Object.keys(resp.getHeaders()).filter((name) => !!name && name !== 'set-cookie');
            return parsed.values();
        },
        values: () => {
            const parsed = Object.values(resp.getHeaders()).filter((value) => !!value) as string[];
            return parsed.values();
        },
        getSetCookie: () => {
            const cookies = resp.getHeader('Set-Cookie');
            if (!cookies) return [];
            if (Array.isArray(cookies)) return cookies;
            return [cookies as string];
        },
        get forEach() {
            return new Map<string, Headers>(resp.getHeaders() as any).forEach;
        },
        get [Symbol.iterator]() {
            return new Map<string, string>(resp.getHeaders() as any)[Symbol.iterator];
        },
    } satisfies Headers;

    return mionHeaders;
}
