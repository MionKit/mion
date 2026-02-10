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
    PersistedPureFunctionsCache,
    PureFnsDataCache,
    RunTypeError,
    DeserializeClassFn,
    AnyClass,
    SerializableClass,
    StrNumber,
    JITUtils,
    PersistedJitFunctionsCache,
    FnsDataCache,
} from './types/general.types';
import {MAX_UNKNOWN_KEYS} from './constants';
import {isSafeMapKeyValue, initPureFunction} from './utils';
import {restoreCompiledJitFns} from './restoreJitFns';
import {jitFnsCache as aotJitFnsCache, pureFnsCache as aotPureFnsCache} from '@mionkit/aot-caches';
import {TypeFormatError} from './types/formats/formats.types';

// Local caches - can be populated from AOT caches via loadJitCaches()
const jitFnsCache: JitFunctionsCache = {};
/** Namespaced pure functions cache: { namespace: { fnHash: CompiledPureFunction } } */
const pureFnsCache: PureFunctionsCache = {};
let coreAOTCachesLoaded = false;

// eslint-disable-next-line no-control-regex
const STR_ESCAPE = /[\u0000-\u001f\u0022\u005c\ud800-\udfff]/;
const MAX_SCAPE_TEST_LENGTH = 1000; // possible to tweak after benchmarking
// serializable classes registry, serializable classes can be automatically deserialized if they are registered here
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

const jitUtils: JITUtils = {
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
    addPureFn(namespace: string, compiledFn: CompiledPureFunction): CompiledPureFunction {
        const fnHash = compiledFn.fnName;
        if (!fnHash) throw new Error('Pure function must have a name and must be unique');
        const nsCache = ensureNamespace(namespace);
        const existing = nsCache[fnHash];
        if (existing) {
            // Validate body hash matches - if not, this is a version conflict
            if (existing.bodyHash && compiledFn.bodyHash && existing.bodyHash !== compiledFn.bodyHash) {
                console.warn(
                    `Pure function ${namespace}::${fnHash} body hash mismatch. ` +
                        `Existing: ${existing.bodyHash}, New: ${compiledFn.bodyHash}. ` +
                        `Replacing with new version.`
                );
                nsCache[fnHash] = compiledFn;
                return compiledFn;
            }
            return existing;
        }

        nsCache[fnHash] = compiledFn;
        return compiledFn;
    },
    usePureFn(namespace: string, fnHash: string): PureFunction {
        const nsCache = pureFnsCache[namespace];
        if (!nsCache) throw new Error(`Pure function namespace ${namespace} not found`);
        const compiled = nsCache[fnHash];
        if (!compiled) throw new Error(`Pure function with name ${fnHash} not found in namespace ${namespace}`);
        initPureFunction(compiled);
        return compiled.fn;
    },
    getPureFn(namespace: string, fnHash: string): PureFunction | undefined {
        const nsCache = pureFnsCache[namespace];
        if (!nsCache) return;
        const compiled = nsCache[fnHash];
        if (!compiled) return;
        initPureFunction(compiled);
        return compiled.fn;
    },
    getCompiledPureFn(namespace: string, fnHash: string): CompiledPureFunction | undefined {
        const nsCache = pureFnsCache[namespace];
        if (!nsCache) return;
        return nsCache[fnHash];
    },
    hasPureFn(namespace: string, fnHash: string): boolean {
        const nsCache = pureFnsCache[namespace];
        if (!nsCache) return false;
        return !!nsCache[fnHash];
    },
    findCompiledPureFn(fnHash: string): CompiledPureFunction | undefined {
        for (const namespace of Object.keys(pureFnsCache)) {
            const nsCache = pureFnsCache[namespace];
            if (nsCache && nsCache[fnHash]) return nsCache[fnHash];
        }
        return undefined;
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
 * Returns the jitUtils instance.
 * This function provides access to the utilities used by JIT generated functions.
 * @returns The JITUtils instance
 */
export function getJitUtils(): JITUtils {
    return jitUtils;
}

/**
 * Adds new AOT JIT and pure functions into the respective caches.
 * This function is intended to be used to restore JitFunctions there were serialized to src code (AOT caches)
 * @param aotFnsCache
 * @param aotPureCache - Namespaced pure functions cache
 */
export function addAOTCaches(aotFnsCache: PersistedJitFunctionsCache, aotPureCache: PersistedPureFunctionsCache) {
    restoreCaches(aotFnsCache, aotPureCache);
}

/**
 * Adds new JIT and pure functions into the respective caches.
 * This function is intended to restore JitFunctions that were serialized and deserialized over the network
 * @param jitDataFnsCache
 * @param pureFnsDataCache - Namespaced pure functions cache
 */
export function addSerializedJitCaches(jitDataFnsCache: FnsDataCache, pureFnsDataCache: PureFnsDataCache) {
    restoreCaches(jitDataFnsCache, pureFnsDataCache);
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
    restoreCaches(aotJitFnsCache as PersistedJitFunctionsCache, aotPureFnsCache as PersistedPureFunctionsCache);
}

function restoreCaches(
    fnsCache: PersistedJitFunctionsCache | FnsDataCache,
    pureCache: PersistedPureFunctionsCache | PureFnsDataCache
) {
    // First load the caches so all entries are available in the global cache
    // This is needed because createJitFn uses jitUtils.getJIT() to resolve dependencies
    for (const key in fnsCache) {
        if (!(key in jitFnsCache)) {
            // it will be transformed into JitCompiledFn by restoreCompiledJitFns()
            // Cloning to avoid mutating the original
            jitFnsCache[key] = {...fnsCache[key]} as JitCompiledFn;
        }
    }
    // Load namespaced pure functions with hash validation
    for (const namespace in pureCache) {
        const nsCache = ensureNamespace(namespace);
        const sourceNsCache = pureCache[namespace];
        for (const key in sourceNsCache) {
            const existing = nsCache[key];
            const incoming = sourceNsCache[key];

            if (existing) {
                // Validate body hash - evict if mismatch
                if (existing.bodyHash && incoming.bodyHash && existing.bodyHash !== incoming.bodyHash) {
                    console.warn(
                        `Pure function ${namespace}::${key} cache eviction: ` +
                            `bodyHash mismatch (cached: ${existing.bodyHash}, server: ${incoming.bodyHash})`
                    );
                    // Replace with incoming version
                    nsCache[key] = {...incoming} as CompiledPureFunction;
                }
                // If hashes match or one is missing, keep existing
            } else {
                // No existing entry, add new one
                nsCache[key] = {...incoming} as CompiledPureFunction;
            }
        }
    }
    // Then restore/initialize the functions (invoke createJitFn to set the fn property)
    // Must restore on the global caches so that when createJitFn calls utl.getJIT() or utl.getPureFn()
    // it gets the restored functions with fn property set
    restoreCompiledJitFns(jitFnsCache, pureFnsCache, getJitUtils());
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

/** Helper function to ensure namespace exists in the cache */
function ensureNamespace(namespace: string): Record<string, CompiledPureFunction> {
    if (!pureFnsCache[namespace]) {
        pureFnsCache[namespace] = {};
    }
    return pureFnsCache[namespace];
}
