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
    readonly pureFnDependencies?: Array<string>;
}
export interface CompiledPureFunction extends PureFunctionData {
    createPureFn: PureFunctionFactory;
    fn?: PureFunction;
}
export interface PersistedPureFunction extends CompiledPureFunction {
    fn: undefined;
} /** Reference object returned by pureServerFn() at runtime on the client */

/** Reference built by serverMapFrom(): identifies a server-side mapper by its ts-runtypes
 *  registry key. The mapper function itself never rides the ref — only `bodyHash` travels
 *  on the wire and the server resolves it against its own registry. */
export interface MapFromServerFnRef<F extends (...args: any[]) => any = (...args: any[]) => any> {
    /** Full ts-runtypes registry key on the wire: `rt::<contentHash>` (inline lane) | `mionjs::<name>` (name lane) */
    readonly bodyHash: string;
    /** Registry namespace half of bodyHash ('rt' | 'mionjs') */
    readonly namespace: string;
    /** Function-name half of bodyHash (content hash, or the registered name) */
    readonly fnName: string;
    /** Always false: mappers resolve as plain pure fns (kept for wire-shape stability) */
    readonly isFactory: boolean;
    fromRequestId: string;
    toRequestId: string;
    /** Index of the parameter in the target route's params array this mapping replaces */
    paramIndex: number;
    mapFromSymbol: symbol;
    /** Returns this reference cast as ReturnType<F>, allowing it to be passed as a parameter to subrequests */
    asArg(): ReturnType<F>;
}

// ########################################### ROUTES FLOW ##########################################

/** Decoded routesFlow query payload sent as base64-encoded JSON in the URL query string */
export interface RoutesFlowQuery {
    /** Route paths to execute, e.g. ["/route1", "/route2"] */
    routes: string[];
    /** Optional mappings that transform one route's output into another route's input */
    mappings?: RoutesFlowMapping[];
}

/** Describes a mapping from one route's output to another route's input parameter */
export interface RoutesFlowMapping {
    /** Source route ID whose output to map from */
    fromId: string;
    /** Target route ID whose input parameter to update */
    toId: string;
    /** Pure function body hash identifier in jitUtils cache */
    bodyHash: string;
    /** Index of the parameter in the target route's params array to replace */
    paramIndex: number;
}
