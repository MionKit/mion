/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {maxUnknownKeys} from './constants';
import type {CompiledOperation, RunTypeError, SerializableClass} from './types';

export type JITUtils = typeof jitUtils;

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;

const classesMap = new Map<string, SerializableClass>();
const jitCache = new Map<string, CompiledOperation>();
const jitObjectKeys = new Map<string, Set<string | number>>();
const jitHashes = new Map<string, string>();

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
        } else if (str.length < 1000 && STR_ESCAPE.test(str) === false) {
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
    addCachedFn(key: string, cop: CompiledOperation) {
        jitCache.set(key, cop);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getCachedCompiledOperation(key: string): CompiledOperation | undefined {
        return jitCache.get(key);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getCachedFn(key: string): undefined | ((...args: any[]) => any) {
        return jitCache.get(key)?.jitFn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getJitFn(key: string): (...args: any[]) => any {
        const cop = jitCache.get(key);
        if (!cop) throw new Error(`Jit function not found for key ${key}`);
        return cop.jitFn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    isFnInCache(key: string) {
        return !!jitCache[key];
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /**
     * Checks if the object has extra unknown keys.
     * if none keys are passe the function assumes theres is a single key with the value of keysId
     * @param obj the object to be checked
     * @param keysId an unique id if the set of keys to be checked, might be keys.join()
     * @param keys the keys that are expected to be in the object
     * @returns false if no unknown keys are found, otherwise an array with the extra unknown keys
     */
    getObjectUnknownKeys(obj: any, keysId: string, ...keys: (string | number)[]): string[] {
        const _keysSet = jitObjectKeys.get(keysId);
        const keysSet = _keysSet || new Set<string | number>(keys.length === 0 ? [keysId] : keys);
        if (!_keysSet) jitObjectKeys.set(keysId, keysSet);
        const result: string[] = [];
        const objectKeys = Object.keys(obj);
        for (const key of objectKeys) {
            if (!keysSet.has(key)) {
                result.push(key);
                if (result.length >= maxUnknownKeys) throw new Error('Too many unknown keys');
            }
        }
        return result;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    objectHasUnknownKeys(obj: any, keysId: string, ...keys: (string | number)[]): boolean {
        const _keysSet = jitObjectKeys.get(keysId);
        const keysSet = _keysSet || new Set<string | number>(keys.length === 0 ? [keysId] : keys);
        if (!_keysSet) jitObjectKeys.set(keysId, keysSet);
        const objectKeys = Object.keys(obj);
        for (const key of objectKeys) {
            if (!keysSet.has(key)) {
                return true;
            }
        }
        return false;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    errPush(εrr: RunTypeError[], path: string, expected: string) {
        εrr.push({path, expected});
    },
};

export const hashChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const hashIncrement = 4;
export const maxHashCollisions = 10;
export const hashDefaultLength = 28;

export function quickHash(input: string, length = hashDefaultLength) {
    const PRIME = 37; // Prime number to mix hash more robustly
    let hash = 0;
    // Generate initial numeric hash
    for (let i = 0; i < input.length; i++) {
        hash = (hash * PRIME + input.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
    }
    // Convert numeric hash to a short alphanumeric string
    let result = '';
    while (result.length < length) {
        hash = (hash * PRIME) % Number.MAX_SAFE_INTEGER;
        result += hashChars.charAt(hash % hashChars.length);
    }
    return result.slice(0, length);
}

export function getJitIDHash(jitId: string, length = hashDefaultLength): string {
    let id = quickHash(jitId, length);
    let counter = 1;
    let existing = jitHashes.get(id);
    // Check if ID already exists and corresponds to the same input
    while (existing && existing !== jitId) {
        length += counter * hashIncrement;
        // generates a longer hash if there are collisions
        // this would allow trying to get all possible hashes for a given input just by increasing the length
        id = quickHash(jitId, length);
        counter++;
        existing = jitHashes.get(id);
        if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for jitId: ${jitId} too many collisions.`);
    }

    // Store the unique ID with its original input string
    jitHashes.set(id, jitId);
    return id;
}
