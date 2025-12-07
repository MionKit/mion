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
    PersistedJitFunctionsCache,
    PersistedPureFunctionsCache,
    JitCompiledFunctions,
    JitFunctionsHashes,
} from './types';
import {MAX_UNKNOWN_KEYS} from './constants';
import {isSafeMapKeyValue, initPureFunction} from './utils';
import {restoreCompiledJitFns} from './jitRestoreCode';
import {jitFnsCache as aotJitFnsCache, pureFnsCache as aotPureFnsCache} from '@mionkit/aot-caches';

// Local caches - can be populated from AOT caches via loadJitCaches()
const jitFnsCache: JitFunctionsCache = {};
const pureFnsCache: PureFunctionsCache = {};

let coreAOTCachesLoaded = false;

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000; // possible to tweak after benchmarking
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
};

/**
 * Adds new AOT JIT and pure functions into the respective caches.
 * First loads the caches (with fn: undefined), then restores them.
 * This ensures all dependencies are available in the global cache when createJitFn is invoked.
 * @param aotJitFnsCache
 * @param aotPureFnsCache
 */
export function addAOTCaches(aotJitFnsCache: PersistedJitFunctionsCache, aotPureFnsCache: PersistedPureFunctionsCache) {
    // First load the caches so all entries are available in the global cache
    // This is needed because createJitFn uses jitUtils.getJIT() to resolve dependencies
    for (const key in aotJitFnsCache) {
        if (!(key in jitFnsCache)) {
            // it will be transformed into JitCompiledFn by restoreCompiledJitFns()
            jitFnsCache[key] = aotJitFnsCache[key] as any as JitCompiledFn;
        }
    }
    for (const key in aotPureFnsCache) {
        if (!(key in pureFnsCache)) {
            pureFnsCache[key] = aotPureFnsCache[key];
        }
    }
    // Then restore/initialize the functions (invoke createJitFn to set the fn property)
    restoreCompiledJitFns(aotJitFnsCache, aotPureFnsCache);
}

/**
 * Returns the jit and pure functions caches.
 * DO NOT MODIFY THE RETURNED OBJECTS AS THEY ARE THE ORIGINAL ONES USED BY THE JIT FUNCTIONS
 * @returns
 */
export function getJitFnCaches() {
    return {
        jitFnsCache: jitFnsCache as Readonly<JitFunctionsCache>,
        pureFnsCache: pureFnsCache as Readonly<PureFunctionsCache>,
    };
}

/**
 * Resets the jit and pure functions caches.
 * This is useful for testing purposes only.
 */
export function resetJitFnCaches() {
    for (const k in jitFnsCache) delete jitFnsCache[k];
    for (const k in pureFnsCache) delete pureFnsCache[k];
    deserializeFnsRegistry.clear();
    serializableClassRegistry.clear();
    coreAOTCachesLoaded = false;
}

/**
 * Loads the JIT and pure function caches from @mionkit/aot-caches.
 * This function should be called by the client package on initialization.
 * The router package generates these caches at runtime so it does not need to call this function.
 * If items are already in the cache, they are not overwritten.
 */
export function coreAOTLoadJitCaches(): void {
    if (coreAOTCachesLoaded) return;
    coreAOTCachesLoaded = true;

    // Merge AOT caches into local caches
    for (const key in aotJitFnsCache) {
        if (!(key in jitFnsCache)) {
            jitFnsCache[key] = aotJitFnsCache[key];
        }
    }
    for (const key in aotPureFnsCache) {
        if (!(key in pureFnsCache)) {
            pureFnsCache[key] = aotPureFnsCache[key];
        }
    }

    // Restore the fn property on JIT functions
    restoreCompiledJitFns(jitFnsCache, pureFnsCache);
}

export function getJitFnHashes(jitFns: JitCompiledFunctions): JitFunctionsHashes {
    return {
        isType: jitFns.isType.jitFnHash,
        typeErrors: jitFns.typeErrors.jitFnHash,
        prepareForJson: jitFns.prepareForJson.jitFnHash,
        restoreFromJson: jitFns.restoreFromJson.jitFnHash,
        jsonStringify: jitFns.jsonStringify.jitFnHash,
        toBinary: jitFns.toBinary.jitFnHash,
        fromBinary: jitFns.fromBinary.jitFnHash,
    };
}
