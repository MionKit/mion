/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiledFn, DeserializeClassFn, AnyClass, SerializableClass} from '../types/general.types.ts';
import {CompiledPureFunction, PureFunction} from '../types/pureFunctions.types.ts';
import {getOrCreateGlobal} from '../utils.ts';

// ############# LEGACY COMPAT STUB — ts-runtypes migration #############
// The old JIT/pure-fn caches existed only to support the old @mionjs/run-types
// runtime type system. Precompiled functions now arrive as ts-runtypes entry
// tuples (see @mionjs/run-types mionAdapter); pure functions live in the
// ts-runtypes registry under the 'mionjs' namespace (registerMionPureFn /
// getMionPureFn in @mionjs/run-types). Class serialization has a ts-runtypes
// equivalent too (registerClassSerializer in @ts-runtypes/core).
//
// This stub keeps the JITUtils shape compiling for the remaining legacy
// consumers (routerUtils client-metadata serialization, pureFunctions.types)
// while the caches themselves are gone: jit/pure lookups resolve to nothing.
// The class registries stay functional until callers move to
// registerClassSerializer. Scheduled for full removal with the core cleanup —
// see migration-docs/05-core-audit.md.

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
    addToJitCache() {},
    removeFromJitCache() {},
    getJIT: () => undefined,
    getJitFn(jitFnHash: string) {
        throw new Error(`Jit function caches were removed in the ts-runtypes migration (requested ${jitFnHash}).`);
    },
    hasJitFn: () => false,
    addPureFn() {
        throw new Error('The mion pure-fn cache was removed. Register through registerMionPureFn (@mionjs/run-types) instead.');
    },
    usePureFn(namespace: string, name: string): PureFunction {
        throw new Error(`Pure fn ${namespace}::${name} not available: use getMionPureFn (@mionjs/run-types).`);
    },
    getPureFn: () => undefined,
    getCompiledPureFn: () => undefined,
    hasPureFn: () => false,
    findCompiledPureFn: () => undefined,
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

/** Returns the legacy jitUtils compat stub (jit/pure caches are gone; class registries remain) */
export function getJitUtils(): JITUtils {
    return jitUtils;
}
