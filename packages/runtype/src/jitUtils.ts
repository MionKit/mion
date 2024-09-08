/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {SerializableClass} from './types';

const classesMap = new Map<string, SerializableClass>();

/** Cache for jit generated functions, only interfaces, classes and named types, must be inserted here */
const jitCache = new Map<string | number, (...args: any[]) => any>();

/**
 * Object that wraps all utilities that are used by the jit generated functions for encode, decode, stringify etc..
 * !!! DO NOT MODIFY METHOD NAMES OF PROPERTY OR METHODS AS THESE ARE HARDCODED IN THE JIT GENERATED CODE !!!
 */
export const jitUtils = {
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** optimized function to convert an string into a json string wrapped in double quotes */
    asJSONString(str) {
        // Bellow code for 'asJSONString' is copied from from https://github.com/fastify/fast-json-stringify/blob/master/lib/serializer.js
        // which in turn got 'inspiration' from typia https://github.com/samchon/typia/blob/master/src/functional/$string.ts
        // both under MIT license
        // typia license: https://github.com/samchon/typia/blob/master/LICENSE
        // fastify lisecense: https://github.com/fastify/fast-json-stringify/blob/master/LICENSE
        // eslint-disable-next-line no-control-regex
        const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
        if (str.length < 42) {
            const len = str.length;
            let result = '';
            let last = -1;
            let point = 255;

            // eslint-disable-next-line
            for (var i = 0; i < len; i++) {
                point = str.charCodeAt(i);
                if (
                    point === 0x22 || // '"'
                    point === 0x5c // '\'
                ) {
                    last === -1 && (last = 0);
                    result += str.slice(last, i) + '\\';
                    last = i;
                } else if (point < 32 || (point >= 0xd800 && point <= 0xdfff)) {
                    // The current character is non-printable characters or a surrogate.
                    return JSON.stringify(str);
                }
            }

            return (last === -1 && '"' + str + '"') || '"' + result + str.slice(last) + '"';
        } else if (str.length < 5000 && STR_ESCAPE.test(str) === false) {
            // Only use the regular expression for shorter input. The overhead is otherwise too much.
            return '"' + str + '"';
        } else {
            return JSON.stringify(str);
        }
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    addSerializableClass(cls: SerializableClass) {
        classesMap.set(cls.name, cls);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getSerializableClass(name: string) {
        return classesMap.get(name);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    addCachedFn(key: string, fn: (...args: any[]) => any) {
        jitCache[key] = fn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getCachedFn(key: string) {
        const jitFn = jitCache[key];
        if (!jitFn) {
            throw new Error(`JIT function with key ${key} not found in cache`);
        }
        return jitFn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    isFnInCache(key: string) {
        return !!jitCache[key];
    },
};

export type JITUtils = typeof jitUtils;
