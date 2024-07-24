/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {SerializableClass} from './types';

const classesMap = new Map<string, SerializableClass>();

/** Cache for jit generated functions, only interfaces, classes and named types, must be inserted here */
const jitCache: {[key: string]: (...args: any[]) => any} = {}; // using an object as might be easies to serialize

/**
 * Object that wraps all utilities that are used by the jit generated functions for encode, decode, stringify etc..
 * !!! DO NOT MODIFY NAMES OF PROPERTY OR METHODS AS THESE ARE HARDCODED IN THE JIT GENERATED CODE !!!
 */
export const jitUtils = {
    // Bellow code for 'asJSONString' is copied from from https://github.com/fastify/fast-json-stringify/blob/master/lib/serializer.js
    // which in turn got 'inspiration' from typia https://github.com/samchon/typia/blob/master/src/functional/$string.ts
    // both under MIT license
    // typia license: https://github.com/samchon/typia/blob/master/LICENSE
    // fastify lisecense: https://github.com/fastify/fast-json-stringify/blob/master/LICENSE
    /** optimized function to convert an string into a json string wrapped in double quotes */
    asJSONString(str) {
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
    addSerializableClass(cls: SerializableClass) {
        classesMap.set(cls.name, cls);
    },
    getSerializableClass(name: string) {
        return classesMap.get(name);
    },
    addToJitCache(key: string, fn: (...args: any[]) => any) {
        jitCache[key] = fn;
    },
    getFromJitCache(key: string) {
        const jitFn = jitCache[key];
        if (!jitFn) {
            throw new Error(`JIT function with key ${key} not found in cache`);
        }
        return jitFn;
    },
};

export const jitVarNames = {
    jitUtils: 'j1tUt1l5',
    asJSONString: `j1tUt1l5.${jitUtils.asJSONString.name}`,
    addSerializableClass: `j1tUt1l5.${jitUtils.addSerializableClass.name}`,
    getSerializableClass: `j1tUt1l5.${jitUtils.getSerializableClass.name}`,
    addToJitCache: `j1tUt1l5.${jitUtils.addToJitCache.name}`,
    getFromJitCache: `j1tUt1l5.${jitUtils.getFromJitCache.name}`,
};

export type JITUtils = typeof jitUtils;
