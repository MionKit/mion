/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MionHeaders} from '../types/context.ts';

// ############# PUBLIC METHODS #############

type HeadersRecord = Record<string, string>;

/**
 * Reusable class for managing HTTP headers with case-insensitive access
 * Similar to the fetch Headers API but optimized for performance
 * https://developer.mozilla.org/en-US/docs/Web/API/Headers
 */
class MionHeadersImpl implements MionHeaders {
    constructor(private headers: HeadersRecord) {}

    append(name: string, value: string): void {
        const nl = name.toLowerCase();
        const existing = this.headers[nl];
        const headerValue = toSingleHeader(value);
        if (existing) {
            this.headers[nl] = `${existing}, ${headerValue}`;
        } else {
            this.headers[nl] = headerValue;
        }
    }

    delete(name: string): void {
        const nl = name.toLowerCase();
        delete this.headers[nl];
    }

    get(name: string): string | undefined | null {
        const nl = name.toLowerCase();
        return this.headers[nl];
    }

    set(name: string, value: string): void {
        const ln = name.toLowerCase();
        this.headers[ln] = value as string;
    }

    has(name: string): boolean {
        const nl = name.toLowerCase();
        return !!this.headers[nl];
    }

    entries(): IterableIterator<[string, string]> {
        return new Map(Object.entries(this.headers)).entries();
    }

    keys(): IterableIterator<string> {
        return new Map(Object.entries(this.headers)).keys();
    }

    values(): IterableIterator<string> {
        return new Map(Object.entries(this.headers)).values();
    }
}

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
export function headersFromRecord(headersObj: Record<string, string>, skipToLower = false): MionHeaders {
    // lazy load headers map
    const headers = parseHeaders(headersObj, skipToLower);
    return new MionHeadersImpl(headers);
}

function toSingleHeader(value: string | number): string {
    if (Array.isArray(value)) return value.join(', ');
    return value as string;
}

function parseHeaders(headersObj: Record<string, string>, skipToLower = false): HeadersRecord {
    if (skipToLower) return headersObj;
    const entries = Object.entries(headersObj);
    const headers: HeadersRecord = {};
    for (let i = 0; i < entries.length; i++) {
        const [name, value] = entries[i];
        if (!value) continue;
        const ln = name.toLowerCase();
        headers[ln] = toSingleHeader(value);
    }
    return headers;
}
