/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

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

// ############# PRIVATE METHODS #############

function headerKeysToLowerCase(headers: Record<string, HeaderValue>, initToLowerCase = true): Record<string, HeaderValue> {
    if (!initToLowerCase) return headers;
    const entries = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]);
    return Object.fromEntries(entries);
}
