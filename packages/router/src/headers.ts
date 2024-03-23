/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MultiHeaderValue, MionHeaders, SingleHeaderValue} from './types/context';

// ############# PUBLIC METHODS #############

/**
 * Return a Headers Like object from a Headers Record structure (Record<string, string | string[]>)
 * Returned Headers object is similar to the fetch Headers object but not exactly the same
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 *
 * This is optimized to avoid creating the Headers Map if it's not strictly needed.
 * ie. for incoming header that only use get method, the Headers object is never created and instead the HeadersRecord is used directly.
 *
 * This function can be used to create a Headers object from incoming request that has the headers in an object structure.
 * ie IncomingMessage.headers or ApiGatewayEvent.headers
 *
 * @param headersObj
 * @returns
 */
export function headersFromRecord(headersObj: Record<string, SingleHeaderValue>, skipToLower = false): MionHeaders {
    // lazy load headers map
    const _setCookies: string[] = [];
    const headers = initHeadersMap(headersObj, _setCookies, skipToLower);

    const mionHeaders = {
        append: (name: string, value: MultiHeaderValue) => {
            const nl = name.toLowerCase();
            if (nl === 'set-cookie') return setCookie(value, _setCookies);
            const existing = headers[nl];
            const headerValue = toSingleHeader(value);
            if (existing) headers[nl] = `${existing}, ${headerValue}`;
            else headers[nl] = headerValue;
        },
        delete: (name: string) => {
            const nl = name.toLowerCase();
            if (nl in headers) delete headers[nl];
        },
        get: (name: string) => headers[name.toLowerCase()],
        set: (name: string, value: MultiHeaderValue) => {
            const ln = name.toLowerCase();
            if (ln === 'set-cookie') return setCookie(value, _setCookies);
            headers[ln] = value as string;
        },
        has: (name: string) => !!headers[name.toLowerCase()],
        entries: () => new Map(Object.entries(headers)).entries(),
        keys: () => new Map(Object.entries(headers)).keys(),
        values: () => new Map(Object.entries(headers)).values(),
        // getSetCookie: () => _setCookies,
    } satisfies MionHeaders;

    return mionHeaders;
}

function toSingleHeader(value: MultiHeaderValue | number): SingleHeaderValue {
    if (Array.isArray(value)) return value.join(', ');
    return value as string;
}

function setCookie(value: MultiHeaderValue, _setCookies: string[]) {
    if (Array.isArray(value)) _setCookies.push(...value);
    else _setCookies.push(value);
}

function initHeadersMap(
    headersObj: Record<string, SingleHeaderValue>,
    _setCookies: string[],
    skipToLower = false
): Record<string, SingleHeaderValue> {
    if (skipToLower) return headersObj;
    const entries = Object.entries(headersObj);
    const headers: Record<string, SingleHeaderValue> = {};

    for (let i = 0; i < entries.length; i++) {
        const [name, value] = entries[i];
        if (!value) continue;

        const ln = name.toLowerCase();
        if (ln === 'set-cookie') {
            if (Array.isArray(value)) {
                _setCookies.push(...value);
            } else {
                _setCookies.push(value);
            }
        } else {
            headers[ln] = toSingleHeader(value);
        }
    }

    return headers;
}
