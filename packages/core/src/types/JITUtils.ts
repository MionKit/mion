import {JitCompiledFn, SerializableClass, AnyClass, DeserializeClassFn} from './general.types.ts';
import type {CompiledPureFunction, PureFunction} from './pureFunctions.types.ts';

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
