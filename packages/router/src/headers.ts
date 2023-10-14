/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {HeaderValue, MionHeaders} from './types/context';
import {isSingleValueHeader} from './types/guards';

export function headersFromRecord(headers: Record<string, HeaderValue> = {}, toLowerCase = true): MionHeaders {
    const mionHeaders = {
        items: headerKeysToLowerCase(headers, toLowerCase),
        append: (name: string, value: HeaderValue) => {
            const lowerName = name.toLowerCase();
            const currentValue = mionHeaders.items[lowerName];
            const isCurrentArray = !isSingleValueHeader(currentValue);
            const isValueArray = !isSingleValueHeader(value);
            if (isCurrentArray && isValueArray) {
                mionHeaders.items[lowerName] = [...currentValue, ...value];
            } else if (isCurrentArray && !isValueArray) {
                mionHeaders.items[lowerName] = [...currentValue, value];
            } else if (!isCurrentArray && isValueArray) {
                mionHeaders.items[lowerName] = `${currentValue}, ${value.join(', ')}`;
            } else {
                mionHeaders.items[lowerName] = `${currentValue}, ${value}`;
            }
        },
        delete: (name: string) => delete mionHeaders.items[name.toLowerCase()],
        get: (name: string) => mionHeaders.items[name.toLowerCase()],
        set: (name: string, value: HeaderValue) => (mionHeaders.items[name.toLowerCase()] = value),
        has: (name: string) => !!mionHeaders.items[name.toLowerCase()],
        entries: () => new Map(Object.entries(mionHeaders.items)).entries(),
        keys: () => new Set(Object.keys(mionHeaders.items)).values(),
        values: () => new Set(Object.values(mionHeaders.items)).values(),
    };
    return mionHeaders;
}

function headerKeysToLowerCase(headers: Record<string, HeaderValue>, toLowerCase = true): Record<string, HeaderValue> {
    if (!toLowerCase) return headers;
    const entries = Object.entries(headers).map(([name, value]) => [name.toLowerCase(), value]);
    return Object.fromEntries(entries);
}
