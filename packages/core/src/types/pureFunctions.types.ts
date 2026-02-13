import type {TypeFormatValue} from './formats/formats.types.ts';
import type {RunTypeError} from './general.types.ts';

type StrNumber = string | number;

// Forward declare JITUtils to avoid circular dependency
export interface JITUtils {
    addToJitCache(comp: any): void;
    removeFromJitCache(comp: any): void;
    getJIT(jitFnHash: string): any | undefined;
    getJitFn(jitFnHash: string): (...args: any[]) => any;
    hasJitFn(jitFnHash: string): boolean;
    addPureFn(namespace: string, compiledFn: any): void;
    usePureFn(namespace: string, name: string): PureFunction;
    getPureFn(namespace: string, name: string): PureFunction | undefined;
    getCompiledPureFn(namespace: string, name: string): CompiledPureFunction | undefined;
    hasPureFn(namespace: string, name: string): boolean;
    findCompiledPureFn(name: string): CompiledPureFunction | undefined;
    setSerializableClass<C extends {new (...args: any[]): any}>(cls: C): void;
    getSerializableClass(name: string): {new (...args: any[]): any} | undefined;
}

// ########################################### PURE FNs ##########################################
/**
 * Functions that can be used by jitCode.
 * These function must not have external dependencies, use variables from outside the function scope, do not have side effects, etc.
 * These function can be correctly serialized/deserialized using function.toString() method.
 * These function can not be anonym and must have an unique name.
 */

export type PureFunctionDeps = Record<string, PureFunction>;
export type GenericPureFunction<P extends TypeFormatValue> = (val: any, formatParams: P, deps: PureFunctionDeps) => any;
export type ErrorsPureFunction<P extends TypeFormatValue> = (
    val: any,
    pλth: StrNumber[],
    εrr: RunTypeError[],
    expected: string,
    formatName: string,
    formatParams: P,
    formatPath: StrNumber[],
    deps: PureFunctionDeps,
    accessPath?: StrNumber[],
    fmtAccessPath?: StrNumber[]
) => RunTypeError[];
export type PureFunction = (...args: any[]) => any; /**
 * Pure function that return an array with a list of invalid format properties.
 * ie: if a string should be maxLength = 5 and that string is 6 characters long, the function should return {invalid:['maxLength']}
 */

export type PureFunctionClosure = (
    jitUtils: JITUtils
) => PureFunction; /** Data for a pure function that can be serialized and deserialized. */

export interface PureFunctionData {
    /** The namespace this pure function belongs to */
    readonly namespace: string;
    /** The names of the arguments of the function */
    readonly paramNames: string[];
    /** The code of the function closure */
    readonly code: string;
    /** Unique id of the function */
    readonly fnName: string;
    /** Hash of the function body for version validation */
    readonly bodyHash: string;
    /** The list of all pure functions that are used by this function and it's children. */
    readonly dependencies: Set<string>;
}
export interface CompiledPureFunction extends PureFunctionData {
    createJitFn: PureFunctionClosure;
    fn?: PureFunction;
}
export interface PersistedPureFunction extends CompiledPureFunction {
    fn: undefined;
}
