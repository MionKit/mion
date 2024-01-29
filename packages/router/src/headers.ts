/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {IncomingMessage, ServerResponse} from 'http';
import type {HeaderValue, MionHeaders} from './types/context';
import {isSingleValueHeader} from './types/guards';

// ############# PUBLIC METHODS #############

export function headersFromRecord(headers: Record<string, HeaderValue>, initToLowercase = true): MionHeaders {
    const sanitized = headerKeysToLowerCase(headers, initToLowercase);
    const mionHeaders = {
        append: (name: string, value: HeaderValue) => {
            const lowerName = name.toLowerCase();
            const currentValue = sanitized[lowerName];
            const isCurrentArray = !isSingleValueHeader(currentValue);
            const isValueArray = !isSingleValueHeader(value);
            if (isCurrentArray && isValueArray) {
                sanitized[lowerName] = [...currentValue, ...value];
            } else if (isCurrentArray && !isValueArray) {
                sanitized[lowerName] = [...currentValue, value];
            } else if (!isCurrentArray && isValueArray) {
                sanitized[lowerName] = `${currentValue}, ${value.join(', ')}`;
            } else {
                sanitized[lowerName] = `${currentValue}, ${value}`;
            }
        },
        delete: (name: string) => delete sanitized[name.toLowerCase()],
        get: (name: string) => sanitized[name.toLowerCase()],
        set: (name: string, value: HeaderValue) => (sanitized[name.toLowerCase()] = value),
        has: (name: string) => !!sanitized[name.toLowerCase()],
        entries: () => new Map(Object.entries(sanitized)).entries(),
        keys: () => new Set(Object.keys(sanitized)).values(),
        values: () => new Set(Object.values(sanitized)).values(),
    };
    return mionHeaders;
}

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

// ############# PRIVATE METHODS #############

function headerKeysToLowerCase(headers: Record<string, HeaderValue>, initToLowerCase = true): Record<string, HeaderValue> {
    if (!initToLowerCase) return headers;
    const entries = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]);
    return Object.fromEntries(entries);
}
