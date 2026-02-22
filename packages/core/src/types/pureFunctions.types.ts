import {TypeFormatValue} from './formats/formats.types.ts';
import {RunTypeError} from './general.types.ts';
import type {JITUtils} from '../jit/jitUtils.ts';

type StrNumber = string | number;

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

export type PureFunctionFactory = (
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
    readonly pureFnDependencies: Array<string>;
}
export interface CompiledPureFunction extends PureFunctionData {
    createPureFn: PureFunctionFactory;
    fn?: PureFunction;
}
export interface PersistedPureFunction extends CompiledPureFunction {
    fn: undefined;
} /** Reference object returned by pureServerFn() at runtime on the client */

export interface PureFnDef<F extends (...args: any[]) => any = (...args: any[]) => any> {
    /** The namespace this pure function belongs to */
    readonly namespace?: string;
    /** The function name (optional, for debugging purposes only) */
    readonly fnName?: string;
    /** Indicates if this is a factory function, function should be called with jitUtils as single argument:
     * ie:
     * const factory = pureServerFn((jitUtils) => {
     *   const myJitDep = jitUtils.getPureFunction('myJitDep');
     *   return (arg1, arg2) => {
     *     // ... function logic
     *   };
     * });
     */
    isFactory?: boolean;
    /** The original function (available in dev, stripped in production) */
    readonly pureFn: F;
}

/** Pre-parsed factory function data injected at build time by the mion vite plugin */
export interface ParsedFactoryFn {
    /** Hash of the function body */
    readonly bodyHash: string;
    /** The names of the factory function parameters */
    readonly paramNames: string[];
    /** The normalized function body code */
    readonly code: string;
}

export interface PureServerFnRef<F extends (...args: any[]) => any = (...args: any[]) => any> extends Required<PureFnDef<F>> {
    /** The namespace this pure function belongs to */
    readonly namespace: string;
    /** The function name (optional, for debugging purposes only) */
    readonly fnName: string;
    /** Hash of the function body - used as the unique identifier */
    readonly bodyHash: string;
    /**
     * Set of pure function dependencies id is equal to `namespace::fnName`
     * This is used so when a function is required by a client all the rest of dependencies are also sent to the client
     */
    pureFnDependencies?: Array<string>;
}
