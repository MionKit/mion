/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {
    JitCompiledFn,
    JitFunctionsCache,
    PureFunctionsCache,
    PersistedPureFunctionsCache,
    PureFnsDataCache,
    DeserializeClassFn,
    AnyClass,
    SerializableClass,
    PersistedJitFunctionsCache,
    FnsDataCache,
} from '../types/general.types.ts';
import {CompiledPureFunction} from '../types/pureFunctions.types.ts';
import {PureFunction} from '../types/pureFunctions.types.ts';
import {initPureFunction, isTestEnv} from '../utils.ts';
import {restoreCompiledJitFns} from '../pureFns/restoreJitFns.ts';

// Local caches - can be populated from AOT caches via addAOTCaches()
// Backed by globalThis so all module instances share the same cache
const JIT_FNS_KEY = Symbol.for('mion.jit-fns/v1');
const PURE_FNS_KEY = Symbol.for('mion.pure-fns/v1');
const jitFnsCache: JitFunctionsCache = ((globalThis as any)[JIT_FNS_KEY] ??= {});
/** Namespaced pure functions cache: { namespace: { fnHash: CompiledPureFunction } } */
const pureFnsCache: PureFunctionsCache = ((globalThis as any)[PURE_FNS_KEY] ??= {});

// serializable classes registry, serializable classes can be automatically deserialized if they are registered here
const deserializeFnsRegistry = new Map<string, DeserializeClassFn<any>>();
const serializableClassRegistry = new Map<string, SerializableClass>();

/**
 * Interface defining the shape of jitUtils
 *
 * !! Important: this needs to be defined as a type for reflection to work correctly
 * !! we can not use  typeof jitUtils
 */
export interface JITUtils {
    /** optimized function to convert an string into a json string wrapped in double quotes */
    addToJitCache(comp: JitCompiledFn): void;
    removeFromJitCache(comp: JitCompiledFn): void;
    getJIT(jitFnHash: string): JitCompiledFn | undefined;
    getJitFn(jitFnHash: string): (...args: any[]) => any;
    hasJitFn(jitFnHash: string): boolean;
    addPureFn(namespace: string, compiledFn: CompiledPureFunction): void;
    usePureFn(namespace: string, name: string): PureFunction;
    getPureFn(namespace: string, name: string): PureFunction | undefined;
    getCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined;
    hasPureFn(namespace: string, name: string): boolean;
    /** Find a pure function across all namespaces. Returns the compiled function or undefined. */
    findCompiledPureFn(name: string): CompiledPureFunction | undefined;
    setSerializableClass<C extends SerializableClass>(cls: C): void;
    useSerializeClass(className: string): SerializableClass;
    getSerializeClass(className: string): SerializableClass | undefined;
    setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
    useDeserializeFn(className: string): DeserializeClassFn<any>;
    getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
}

const jitUtils: JITUtils = {
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
    /**
     * Checks if key map can be serialized/deserialized with json and still works as a key for a map.
     * ie: if a map key is an string, it can be serialized to json and deserialized back an still will identify the correct map entry.
     * ie: if a map entry is an object, the object can not be serialized/deserialized and wont work as the same key for entry map as they are not same memory ref.
     *  */

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
 * Note: After calling this, AOT caches must be re-registered via virtual modules or addAOTCaches().
 */
export function resetJitFnCaches() {
    if (!isTestEnv()) throw new Error('resetJitFnCaches() can only be called fro testing purposes');
    for (const k in jitFnsCache) delete jitFnsCache[k];
    for (const k in pureFnsCache) delete pureFnsCache[k];
    deserializeFnsRegistry.clear();
    serializableClassRegistry.clear();
}

/** Helper function to ensure namespace exists in the cache */
function ensureNamespace(namespace: string): Record<string, CompiledPureFunction> {
    if (!pureFnsCache[namespace]) {
        pureFnsCache[namespace] = {};
    }
    return pureFnsCache[namespace];
}
