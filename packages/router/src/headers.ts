/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeaderValue, MionHeaders, MionReadonlyHeaders, isSingleValueHeader} from '..';

export function headersFromRecord(headers: Record<string, HeaderValue> = {}): MionHeaders {
    return {
        append: (name: string, value: HeaderValue) => {
            const lowerName = name.toLowerCase();
            const currentValue = headers[lowerName];
            const isCurrentArray = !isSingleValueHeader(currentValue);
            const isValueArray = !isSingleValueHeader(value);
            if (isCurrentArray && isValueArray) {
                headers[lowerName] = [...currentValue, ...value];
            } else if (isCurrentArray && !isValueArray) {
                headers[lowerName] = [...currentValue, value];
            } else if (!isCurrentArray && isValueArray) {
                headers[lowerName] = `${currentValue}, ${value.join(', ')}`;
            } else {
                headers[lowerName] = `${currentValue}, ${value}`;
            }
        },
        delete: (name: string) => delete headers[name.toLowerCase()],
        get: (name: string) => headers[name.toLowerCase()],
        has: (name: string) => !!headers[name.toLowerCase()],
        set: (name: string, value: HeaderValue) => (headers[name.toLowerCase()] = value),
        entries: () => new Map(Object.entries(headers)).entries(),
        keys: () => new Set(Object.keys(headers)).values(),
        values: () => new Set(Object.values(headers)).values(),
    };
}

export function readOnlyHeadersFromRecord(headers: Record<string, HeaderValue> = {}): MionReadonlyHeaders {
    return {
        get: (name: string) => headers.headers[name.toLowerCase()],
        has: (name: string) => !!headers.headers[name.toLowerCase()],
        entries: () => new Map(Object.entries(headers)).entries(),
        keys: () => new Set(Object.keys(headers)).values(),
        values: () => new Set(Object.values(headers)).values(),
    };
}
