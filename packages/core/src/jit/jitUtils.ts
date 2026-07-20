/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiledFn, DeserializeClassFn, AnyClass, SerializableClass} from '../types/general.types.ts';
import {CompiledPureFunction, PureFunction} from '../types/pureFunctions.types.ts';
import {getOrCreateGlobal} from '../utils.ts';

// ############# ts-runtypes-BACKED LOOKUPS #############
// The old JIT/pure-fn caches existed only to support the old @mionjs/run-types
// runtime type system. Precompiled functions now live in the ts-runtypes runtime
// cache; @mionjs/run-types installs a lookup backend here (installJitLookupBackend)
// that resolves mion jit hashes (`<JIT_FUNCTION_IDS.x>_<typeId>`, which match the
// ts-runtypes fn-cache keys exactly) and mion pure fns straight from that cache.
// Core itself stays dependency-free: without a backend installed, jit/pure lookups
// resolve to nothing. The class registries remain local until callers move to
// registerClassSerializer (@ts-runtypes/core) — see docs/done/core-audit.md.

/** Lookup backend installed by @mionjs/run-types to resolve jit/pure fns from the ts-runtypes cache */
export interface JitLookupBackend {
    getJIT(jitFnHash: string): JitCompiledFn | undefined;
    getCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined;
}

const backendRef = getOrCreateGlobal('mion.jit.lookupBackend', () => ({current: undefined as JitLookupBackend | undefined}));

/** Installs the ts-runtypes-backed lookup (called by @mionjs/run-types at import time) */
export function installJitLookupBackend(backend: JitLookupBackend): void {
    backendRef.current = backend;
}

const deserializeFnsRegistry = getOrCreateGlobal(
    'mion.jit.deserializeFnsRegistry',
    () => new Map<string, DeserializeClassFn<any>>()
);
const serializableClassRegistry = getOrCreateGlobal(
    'mion.jit.serializableClassRegistry',
    () => new Map<string, SerializableClass>()
);

/** Legacy jit-utils shape kept for type compatibility (JitCompiledFn.createJitFn receives it) */
export interface JITUtils {
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
    findCompiledPureFn(name: string): CompiledPureFunction | undefined;
    setSerializableClass<C extends SerializableClass>(cls: C): void;
    useSerializeClass(className: string): SerializableClass;
    getSerializeClass(className: string): SerializableClass | undefined;
    setDeserializeFn<C extends AnyClass>(cls: C, deserializeFn: DeserializeClassFn<InstanceType<C>>): void;
    useDeserializeFn(className: string): DeserializeClassFn<any>;
    getDeserializeFn(className: string): DeserializeClassFn<any> | undefined;
}

const jitUtils: JITUtils = {
    addToJitCache() {
        throw new Error(
            'The mion jit cache was removed. Fn caches are build-injected; use addSerializedJitCaches (@mionjs/run-types) for the metadata lane.'
        );
    },
    removeFromJitCache() {
        throw new Error('The mion jit cache was removed. Use resetJitFnCaches (@mionjs/run-types) in tests instead.');
    },
    getJIT: (jitFnHash: string) => backendRef.current?.getJIT(jitFnHash),
    getJitFn(jitFnHash: string) {
        const compiled = backendRef.current?.getJIT(jitFnHash);
        if (!compiled) throw new Error(`Jit function ${jitFnHash} not found in the ts-runtypes cache.`);
        return compiled.fn;
    },
    hasJitFn: (jitFnHash: string) => !!backendRef.current?.getJIT(jitFnHash),
    addPureFn() {
        throw new Error('The mion pure-fn cache was removed. Register through registerMionPureFn (@mionjs/run-types) instead.');
    },
    usePureFn(namespace: string, name: string): PureFunction {
        const compiled = backendRef.current?.getCompiledPureFn(namespace, name);
        if (!compiled)
            throw new Error(`Pure fn ${namespace}::${name} not available: use registerMionPureFn (@mionjs/run-types).`);
        return compiled.fn as PureFunction;
    },
    getPureFn: (namespace: string, name: string) =>
        backendRef.current?.getCompiledPureFn(namespace, name)?.fn as PureFunction | undefined,
    getCompiledPureFn: (namespace: string, name: string) => backendRef.current?.getCompiledPureFn(namespace, name),
    hasPureFn: (namespace: string, name: string) => !!backendRef.current?.getCompiledPureFn(namespace, name),
    findCompiledPureFn() {
        throw new Error('findCompiledPureFn was removed. Look pure fns up by name with getMionPureFn (@mionjs/run-types).');
    },
    setSerializableClass() {
        throw new Error(
            'The mion class registries were removed. Register custom classes with registerClassSerializer (@mionjs/run-types) instead.'
        );
    },
    useSerializeClass(className: string): SerializableClass {
        const cls = serializableClassRegistry.get(className);
        if (!cls) throw new Error(`Serializable class with name ${className} not found, be sure to register it first`);
        return cls;
    },
    getSerializeClass(className: string): SerializableClass | undefined {
        return serializableClassRegistry.get(className);
    },
    setDeserializeFn() {
        throw new Error(
            'The mion class registries were removed. Register custom classes with registerClassSerializer (@mionjs/run-types) instead.'
        );
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

/** Returns the legacy jitUtils compat stub (jit/pure caches are gone; class registries remain) */
export function getJitUtils(): JITUtils {
    return jitUtils;
}
