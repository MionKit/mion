/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {HeadersRecord, MultiHeader, SingleHeader} from './types/context';

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
export function headersFromRecord(headersObj: HeadersRecord): Headers {
    // lazy load headers map
    let _headersMap: Map<string, SingleHeader> | undefined;
    const _setCookies: string[] = [];
    function headers() {
        if (_headersMap) return _headersMap;
        _headersMap = new Map();
        Object.entries(headersObj).forEach(([name, value]) => {
            const ln = name.toLowerCase();
            const isArr = Array.isArray(value);
            if (ln === 'set-cookie') {
                if (isArr) return _setCookies.push(...value);
                return _setCookies.push(value);
            }
            _headersMap!.set(ln, isArr ? value.join(', ') : value);
        });
        return _headersMap;
    }
    const mionHeaders = {
        append: (name: string, value: MultiHeader) => {
            const nl = name.toLowerCase();
            const existing = headers().get(nl);
            const headerValue: string = Array.isArray(value) ? value.join(', ') : value;
            if (existing) headers().set(nl, `${existing}, ${headerValue}`);
            else headers().set(nl, headerValue);
        },
        delete: (name: string) => {
            const ln = name.toLowerCase();
            if (!_headersMap) {
                if (ln in headersObj) delete headersObj[ln];
                return;
            }
            headers().delete(ln);
        },
        get: (name: string) => {
            const ln = name.toLowerCase();
            if (!_headersMap) {
                // prevents lazy load of headers map
                const value1 = headersObj[ln];
                if (Array.isArray(value1)) return value1.join(', ');
                return value1 as string;
            }
            const value = headers().get(ln);
            if (Array.isArray(value)) return value.join(', ');
            return value as string;
        },
        set: (name: string, value: MultiHeader) => headers().set(name.toLowerCase(), value as string),
        has: (name: string) => {
            const ln = name.toLowerCase();
            if (!_headersMap) return ln in headersObj;
            return headers().has(ln);
        },
        entries: () => headers().entries(),
        keys: () => {
            if (!_headersMap) return Object.keys(headersObj).values();
            return headers().keys();
        },
        values: () => headers().values(),
        getSetCookie: () => _setCookies,
        get forEach() {
            return headers().forEach as any;
        },
        get [Symbol.iterator]() {
            return headers()[Symbol.iterator] as any;
        },
    } satisfies Headers;

    return mionHeaders;
}
