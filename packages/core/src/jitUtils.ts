/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    CompiledPureFunction,
    JitCompiledFn,
    JitFunctionsCache,
    PureFunction,
    PureFunctionsCache,
    RunTypeError,
    TypeFormatError,
    DeserializeClassFn,
    AnyClass,
    SerializableClass,
    StrNumber,
    JITUtils,
} from './types';
import {MAX_UNKNOWN_KEYS} from './constants';
import {isSafeMapKeyValue, initPureFunction} from './utils';
import {restoreCompiledJitFns} from './jitRestoreCode';

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000; // possible to tweak after benchmarking
// initial map to store jit functions, file gest recompiled 🔁 and overridden when
const jitFnsCache: JitFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};
// serializable classes registry, serializable classes can be automatically deserialized if they are registered here
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

/**
 * Object that wraps all utilities that are used by the jit generated functions for encode, decode, stringify etc..
 * !!! DO NOT MODIFY METHOD NAMES OF PROPERTY OR METHODS AS THESE ARE HARDCODED IN THE JIT GENERATED CODE !!!
 */
export const jitUtils: JITUtils = {
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
                    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
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
    addToJitCache(comp: JitCompiledFn) {
        jitFnsCache[comp.jitFnHash] = comp;
    },
    removeFromJitCache(comp: JitCompiledFn) {
        if (!jitFnsCache[comp.jitFnHash]) return;
        (jitFnsCache[comp.jitFnHash] as any) = undefined;
    },
    getJIT(jitFnHash: string): JitCompiledFn | undefined {
        return jitFnsCache[jitFnHash];
    },
    getJitFn(jitFnHash: string): (...args: any[]) => any {
        const comp = jitFnsCache[jitFnHash];
        if (!comp) throw new Error(`Jit function not found for jitFnHash ${jitFnHash}`);
        return comp.fn;
    },
    hasJitFn(jitFnHash: string) {
        return !!jitFnsCache[jitFnHash]?.fn;
    },
    safeKey(value: any): any {
        if (isSafeMapKeyValue(value)) return value;
        return null;
    },
    addPureFn(compiledFn: CompiledPureFunction) {
        const fnHash = compiledFn.pureFnHash;
        if (!fnHash) throw new Error('Pure function must have a name and must be unique');
        const existing = pureFnsCache[fnHash];
        if (existing) return existing;
        pureFnsCache[fnHash] = compiledFn;
    },
    usePureFn(fnHash: string): PureFunction {
        const compiled = pureFnsCache[fnHash];
        if (!compiled) throw new Error(`Pure function with name ${fnHash} not found`);
        initPureFunction(compiled);
        return compiled.fn;
    },
    getPureFn(fnHash: string): PureFunction | undefined {
        const compiled = pureFnsCache[fnHash];
        if (!compiled) return;
        initPureFunction(compiled);
        return compiled.fn;
    },
    getCompiledPureFn(fnHash: string): CompiledPureFunction | undefined {
        return pureFnsCache[fnHash];
    },
    hasPureFn(fnHash: string): boolean {
        return !!pureFnsCache[fnHash];
    },
    setSerializableClass<C extends SerializableClass>(cls: C) {
        const className = cls.name;
        const existingClass = serializableClassRegistry.get(className);
        if (existingClass && existingClass !== cls) throw new Error(`Deserializable Class ${className} already registered`);
        serializableClassRegistry.set(className, cls);
    },
    useSerializeClass(className: string): SerializableClass {
        const cls = serializableClassRegistry.get(className);
        if (!cls) throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
        return cls;
    },
    getSerializeClass(className: string): SerializableClass | undefined {
        return serializableClassRegistry.get(className);
    },
    setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>) {
        const className = cls.name;
        const fn = deserializeFnsRegistry.get(className);
        if (fn && fn !== deserializeFn) throw new Error(`Deserialize function for class ${className} already exists`);
        if (fn) return;
        deserializeFnsRegistry.set(className, deserializeFn);
    },
    useDeserializeFn(className: string): DeserializeClassFn<any> {
        const fn = deserializeFnsRegistry.get(className);
        if (!fn) throw new Error(`Deserialize function for class ${className} not found, be sure to register it first`);
        return fn;
    },
    getDeserializeFn(className: string): DeserializeClassFn<any> | undefined {
        return deserializeFnsRegistry.get(className);
    },

    // TODO: all functions bellow could be moved to pure functions instead being part of jitUtils
    getUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): StrNumber[] {
        const unknownKeys: StrNumber[] = [];
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
                if (unknownKeys.length >= MAX_UNKNOWN_KEYS) throw new Error('Too many unknown keys');
            }
        }
        // console.log('getUnknownKeysFromArray: ', false, unknownKeys);
        return unknownKeys;
    },
    hasUnknownKeysFromArray(obj: Record<StrNumber, any>, keys: StrNumber[]): boolean {
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
    /**
     * Creates an new RunTypeError and adds it to the errors array
     * Note that all paths are copied when creating the new RunTypeError
     * so they can't be modified after the error is created
     */
    err(pλth: readonly StrNumber[], εrr: RunTypeError[], expected: string, accessPath?: readonly StrNumber[]) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const runTypeErr: RunTypeError = {expected, path};
        εrr.push(runTypeErr);
    },
    /**
     * Creates an new RunTypeError with a TypeFormatError and adds it to the errors array
     * Note that all paths are copied when creating the new RunTypeError
     * so they can't be modified after the error is created
     */
    formatErr(
        pλth: StrNumber[],
        εrr: RunTypeError[],
        expected: string,
        fmtName: string,
        paramName: string,
        paramVal: string | number | boolean | bigint,
        fmtPath: StrNumber[],
        accessPath?: StrNumber[],
        fmtAccessPath?: StrNumber[]
    ) {
        const path = accessPath?.length ? [...pλth, ...accessPath] : [...pλth];
        const formatPath = fmtAccessPath?.length ? [...fmtPath, ...fmtAccessPath, paramName] : [...fmtPath, paramName];
        const format: TypeFormatError = {name: fmtName, formatPath: formatPath, val: paramVal};
        const runTypeErr: Required<RunTypeError> = {expected, path, format};
        εrr.push(runTypeErr);
    },

    // BSON serialization utilities
    writeBSONNull(): Uint8Array {
        return new Uint8Array([0x0a]); // BSON null type
    },

    writeBSONBoolean(value: boolean): Uint8Array {
        return new Uint8Array([0x08, value ? 0x01 : 0x00]); // BSON boolean type + value
    },

    writeBSONInt32(value: number): Uint8Array {
        const buffer = new Uint8Array(5); // type + 4 bytes
        buffer[0] = 0x10; // BSON int32 type
        const view = new DataView(buffer.buffer);
        view.setInt32(1, value, true); // little-endian
        return buffer;
    },

    writeBSONInt64(value: number | bigint): Uint8Array {
        const buffer = new Uint8Array(9); // type + 8 bytes
        buffer[0] = 0x12; // BSON int64 type
        const view = new DataView(buffer.buffer);
        if (typeof value === 'number') {
            view.setBigInt64(1, BigInt(value), true); // little-endian
        } else {
            view.setBigInt64(1, value, true); // little-endian
        }
        return buffer;
    },

    writeBSONDouble(value: number): Uint8Array {
        const buffer = new Uint8Array(9); // type + 8 bytes
        buffer[0] = 0x01; // BSON double type
        const view = new DataView(buffer.buffer);
        view.setFloat64(1, value, true); // little-endian
        return buffer;
    },

    writeBSONString(value: string): Uint8Array {
        const utf8Bytes = new TextEncoder().encode(value);
        const stringLength = utf8Bytes.length + 1; // include null terminator
        const buffer = new Uint8Array(1 + 4 + stringLength); // type + length + string + null
        buffer[0] = 0x02; // BSON string type
        const view = new DataView(buffer.buffer);
        view.setInt32(1, stringLength, true); // little-endian
        buffer.set(utf8Bytes, 5);
        buffer[buffer.length - 1] = 0; // null terminator
        return buffer;
    },

    writeBSONBinary(data: Uint8Array, subtype: number = 0x00): Uint8Array {
        const buffer = new Uint8Array(1 + 4 + 1 + data.length); // type + length + subtype + data
        buffer[0] = 0x05; // BSON binary type
        const view = new DataView(buffer.buffer);
        view.setInt32(1, data.length, true); // little-endian
        buffer[5] = subtype;
        buffer.set(data, 6);
        return buffer;
    },

    writeBSONArray(items: Uint8Array[]): Uint8Array {
        // Calculate total size
        let totalSize = 1 + 4; // type + document size
        items.forEach((item, index) => {
            totalSize += String(index).length + 1 + item.length; // key + null + item
        });
        totalSize += 1; // document terminator

        const buffer = new Uint8Array(totalSize);
        buffer[0] = 0x04; // BSON array type
        const view = new DataView(buffer.buffer);
        view.setInt32(1, totalSize - 1, true); // document size (excluding type byte)

        let position = 5;
        items.forEach((item, index) => {
            const keyBytes = new TextEncoder().encode(String(index));
            buffer.set(keyBytes, position);
            position += keyBytes.length;
            buffer[position] = 0; // null terminator for key
            position += 1;
            buffer.set(item, position);
            position += item.length;
        });
        buffer[buffer.length - 1] = 0; // document terminator
        return buffer;
    },

    writeBSONDocument(fields: Array<{name: string; type: number; data: Uint8Array}>): Uint8Array {
        // Calculate total size
        let totalSize = 1 + 4; // type + document size
        fields.forEach((field) => {
            totalSize += 1 + field.name.length + 1 + field.data.length; // type + key + null + data
        });
        totalSize += 1; // document terminator

        const buffer = new Uint8Array(totalSize);
        buffer[0] = 0x03; // BSON document type
        const view = new DataView(buffer.buffer);
        view.setInt32(1, totalSize - 1, true); // document size (excluding type byte)

        let position = 5;
        fields.forEach((field) => {
            buffer[position] = field.type;
            position += 1;
            const keyBytes = new TextEncoder().encode(field.name);
            buffer.set(keyBytes, position);
            position += keyBytes.length;
            buffer[position] = 0; // null terminator for key
            position += 1;
            buffer.set(field.data, position);
            position += field.data.length;
        });
        buffer[buffer.length - 1] = 0; // document terminator
        return buffer;
    },
};

/**
 * Loads compiled JIT and pure functions into the respective caches.
 * This function merges the provided cache data into the existing caches without overwriting existing entries.
 * @param caches - Object containing JIT and pure function cache data to merge
 */
export function loadCompiledCaches(caches: {jitFnsCache?: JitFunctionsCache; pureFnsCache?: PureFunctionsCache}) {
    if (caches.jitFnsCache) {
        for (const [key, value] of Object.entries(caches.jitFnsCache)) {
            if (!(key in jitFnsCache)) {
                jitFnsCache[key] = value;
            }
        }
    }
    if (caches.pureFnsCache) {
        for (const [key, value] of Object.entries(caches.pureFnsCache)) {
            if (!(key in pureFnsCache)) {
                pureFnsCache[key] = value;
            }
        }
    }
}

/**
 * Returns the jit and pure functions caches.
 * DO NOT MODIFY THE RETURNED OBJECTS AS THEY ARE THE ORIGINAL ONES USED BY THE JIT FUNCTIONS
 * @returns
 */
export function getFnCaches() {
    return {
        jitFnsCache: jitFnsCache as Readonly<JitFunctionsCache>,
        pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
    };
}

/**
 * Resets the jit and pure functions caches.
 * This is useful for testing purposes only.
 */
export function resetFnCaches() {
    for (const k in jitFnsCache) delete jitFnsCache[k];
    for (const k in pureFnsCache) delete pureFnsCache[k];
    deserializeFnsRegistry.clear();
    serializableClassRegistry.clear();
}

restoreCompiledJitFns(jitFnsCache, pureFnsCache);
