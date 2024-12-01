/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {maxStackDepth, maxUnknownKeys} from '../constants';
import type {CompiledOperation, RunTypeError} from '../types';
import type {BaseCompiler} from './jitCompiler';

export type JITUtils = typeof jitUtils;

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000; // possible to tweak after benchmarking
const jitCache = new Map<string, CompiledOperation>();
const jitHashes = new Map<string, string>();

/**
 * Object that wraps all utilities that are used by the jit generated functions for encode, decode, stringify etc..
 * !!! DO NOT MODIFY METHOD NAMES OF PROPERTY OR METHODS AS THESE ARE HARDCODED IN THE JIT GENERATED CODE !!!
 */
export const jitUtils = {
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    /** optimized function to convert an string into a json string wrapped in double quotes */
    asJSONString(str: string) {
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
        } else if (str.length < MAX_SCAPE_TEST_LENGTH && STR_ESCAPE.test(str) === false) {
            // Only use the regular expression for shorter input. The overhead is otherwise too much.
            return '"' + str + '"';
        } else {
            return JSON.stringify(str);
        }
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    addToJitCache(key: string, comp: BaseCompiler) {
        // TODO: atm we cant store the compiled version as the jit fn gets updated in the original object after the compilation ends, so we losing the reference to fn
        // const compiled: CompiledOperation = {
        //     fn: comp.fn!,
        //     fnId: comp.fnId,
        //     args: comp.args,
        //     defaultParamValues: comp.defaultParamValues,
        //     code: comp.code,
        //     jitFnHash: comp.jitFnHash,
        //     jitId: comp.jitId,
        //     directDependencies: comp.directDependencies,
        //     childDependencies: comp.childDependencies,
        // };
        jitCache.set(key, comp as CompiledOperation);
    },
    removeFromJitCache(key: string) {
        jitCache.delete(key);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getJIT(key: string): CompiledOperation | undefined {
        return jitCache.get(key);
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getJitFn(key: string): (...args: any[]) => any {
        const comp = jitCache.get(key);
        if (!comp) throw new Error(`Jit function not found for key ${key}`);
        return comp.fn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    hasJitFn(key: string) {
        return !!jitCache.get(key)?.fn;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    getUnknownKeysFromSet(obj: Record<string | number, any>, keys: Set<string | number>): (string | number)[] {
        const unknownKeys: (string | number)[] = [];
        for (const prop in obj) {
            if (!keys.has(prop)) {
                unknownKeys.push(prop);
                if (unknownKeys.length >= maxUnknownKeys) throw new Error('Too many unknown keys');
            }
        }
        return unknownKeys;
    },
    getUnknownKeysFromArray(obj: Record<string | number, any>, keys: (string | number)[]): (string | number)[] {
        const unknownKeys: (string | number)[] = [];
        for (const prop in obj) {
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                unknownKeys.push(prop as string);
                if (unknownKeys.length >= maxUnknownKeys) throw new Error('Too many unknown keys');
            }
        }
        return unknownKeys;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    hasUnknownKeysFromArray(obj: Record<string | number, any>, keys: (string | number)[]): boolean {
        for (const prop in obj) {
            // iterates over the object keys and if not found prop adds to unknownKeys
            let found = false;
            for (let j = 0; j < keys.length; j++) {
                if (keys[j] === prop) {
                    found = true;
                    break;
                }
            }
            if (!found) return true;
        }
        return false;
    },
    hasUnknownKeysFromSet(obj: Record<string | number, any>, keys: Set<string | number>): boolean {
        for (const prop in obj) {
            if (!keys.has(prop)) return true;
        }
        return false;
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    err(err: RunTypeError[], path: (string | number)[], pathItems: (string | number)[], expected: string) {
        if (path.length) err.push({path: [...path, ...pathItems], expected});
        else err.push({path: pathItems, expected});
    },
    // !!! DO NOT MODIFY METHOD WITHOUT REVIEWING JIT CODE INVOCATIONS!!!
    safeMapKey(value: any): any {
        if (isSafeMapKeyValue(value)) return value;
        return null;
    },
};

export const hashChars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
export const hashIncrement = 1;
export const maxHashCollisions = 22;
// TODO: investigate if this is a good default length, we want short hashes for small code size
// variable hash length avoids collisions, so there shouldn't be any problems. but better to keep an eye on it
export const hashDefaultLength = 8;

export function quickHash(input: string, length = hashDefaultLength, prevResult?: string): string {
    const PRIME = 37; // Prime number to mix hash more robustly
    let hash = 0;
    // Generate initial numeric hash
    for (let i = 0; i < input.length; i++) {
        hash = (hash * PRIME + input.charCodeAt(i)) % Number.MAX_SAFE_INTEGER;
    }
    let result = prevResult || '';
    // Convert numeric hash to a short alphanumeric string
    while (result.length < length) {
        hash = (hash * PRIME) % Number.MAX_SAFE_INTEGER;
        result += hashChars.charAt(hash % hashChars.length);
    }
    return result.slice(0, length);
}

export function createJitIDHash(jitId: string, length = hashDefaultLength): string {
    let id = quickHash(jitId, length);
    let counter = 1;
    let existing = jitHashes.get(id);
    // Check if ID already exists and corresponds to the same input
    while (existing && existing !== jitId) {
        length += counter * hashIncrement;
        // generates a longer hash if there are collisions
        // this would allow trying to get all possible hashes for a given input just by increasing the length
        const newId = quickHash(jitId, length, id);
        if (process.env.DEBUG_JIT || process.env.NODE_ENV === 'test')
            console.warn(
                `Collision for jitId: ${jitId} with extended hash: ${newId}, and existing jitId: ${existing} with hash: ${id}`
            );
        id = newId;
        counter++;
        existing = jitHashes.get(id);
        if (counter > maxHashCollisions) throw new Error(`Cannot generate unique hash for jitId: ${jitId} too many collisions.`);
    }

    // Store the unique ID with its original input string
    jitHashes.set(id, jitId);
    return id;
}

/**
 * Checks if key map can be serialized/deserialized with json and still works as a key for a map.
 * ie: if a map key is an string, it can be serialized to json and deserialized back an still will identify the correct map entry.
 * ie: if a map entry is an object, the object can not be serialized/deserialized and wont work as the same key for entry map as they are not same memory ref.
 *  */
export function isSafeMapKeyValue(value: any, depth = 0): boolean {
    if (depth > maxStackDepth) return false;
    if (value === undefined) return true;
    if (value === null) return true;
    const type = typeof value;
    if (type === 'number' || type === 'string' || type === 'boolean') return true;
    return false;
}
