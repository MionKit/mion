/* ###############
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import type {jitUtils} from '@mionkit/core/src/jitUtils';
import {JSONString, JSONValue} from '@mionkit/run-types/src/types';

type StrNumber = string | number;
export type JITUtils = typeof jitUtils;

// ########################################## Options ##########################################

export type CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
};

// ##########################################  Errors ##########################################

/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export interface RpcErrorParams {
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: number;
    /** the message that will be returned in the response */
    publicMessage?: string;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: string;
    /** options data related to the error, ie validation data */
    errorData?: unknown;
    /** original error used to create the RpcError */
    originalError?: Error;
    /** name of the error, if not defined it is assigned from status code */
    name?: string;
}

export interface RpcErrorWithPublic extends RpcErrorParams {
    publicMessage: string;
}

export interface RpcErrorWithPrivate extends RpcErrorParams {
    message: string;
}

/** Error data returned to the clients  */
export interface PublicRpcError extends Omit<RpcErrorParams, 'publicMessage' | 'originalError'> {
    /**
     * When a RpcError gets anonymized the publicMessage becomes the message.
     * RpcError.publicMessage => PublicRpcError.message
     * */
    message: string;
    statusCode: number;
    name: string;
}

export type AnyErrorParams = RpcErrorWithPublic | RpcErrorWithPrivate;

export interface RunTypeError {
    /**
     * Path the the property that failed validation if the validated item was an object class, etc..
     * Index if item that failed validation was in an array.
     * null if validated item was a single property */
    path: StrNumber[];
    /** the type of the expected data */
    expected: string;
    format?: TypeFormatError;
    // typeName?: string; // tyeName can not be included as two types could Have the same typeID and different names
}

// ###########################################  Others ##########################################

export type AnyObject = {
    [key: string]: unknown;
};

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

// ########################################### TYPE FORMATS ##########################################

export type TypeFormatError = {
    /** The name of the format that failed */
    name: string; // the name of the format that failed
    /** Expected value, for larger Values, regexp and others the error reason is returned instead */
    val: StrNumber | boolean | bigint | (StrNumber | boolean | bigint)[];
    /**
     * The path to the section of the format that failed.
     * ie: for an email that failed the TLD part, the path should be ['domain', 'tld']
     * ie: for an email that has character not allowed in the local part, the path should be ['localPart']
     * */
    formatPath: StrNumber[];
};

export type FormatParamLiteral = string | number | boolean | RegExp | bigint;
export type TypeFormatValue =
    | FormatParamLiteral
    | readonly TypeFormatValue[]
    | {[key: string]: TypeFormatValue | undefined | never}; // undefined is used to allow optional properties
export type FormatParamMeta<L extends TypeFormatValue = TypeFormatValue> = {
    /** Value of the format param, can ONLY be a Literal Value */
    val: L;
    /** Error reason in case validation fails due to this value, should be a unique reason  */
    reason: string;
    /**  Description of the format param, can be used to generate documentation */
    desc?: string;
};
export type FormatParam<L extends TypeFormatValue> = L | FormatParamMeta<L>;
export type TypeFormatParams = Record<string, TypeFormatValue | undefined | never>;
export type TypeFormatParsedParams = {__jitId: string; [key: string]: TypeFormatValue};

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
export type PureFunction = (...args: any[]) => any;

/**
 * Pure function that return an array with a list of invalid format properties.
 * ie: if a string should be maxLength = 5 and that string is 6 characters long, the function should return {invalid:['maxLength']}
 */
export type PureFunctionWithClosure = (jitUtils: JITUtils) => PureFunction;

export type CompiledPureFunction = {
    originClosureFn: PureFunctionWithClosure;
    fn?: PureFunction;
    paramNames: string[];
    body: string;
    name: string;
    dependencies: Set<string>;
};

// ########################################### COMPILER ##########################################

export type AnyFn = (...args: any[]) => any;
/**
 * The argument names of the function to be compiled. The order of properties is important as must the same as the function args.
 * ie: {vλl: 'val', arg1: 'arg1', error: 'err'} for the function (vλl, arg1, eArr) => any
 */
export type JitFnArgs = {
    /** The name of the value of to be */
    vλl: string;
    /** Other argument names */
    [key: string]: string;
};

export interface JitCompiledFnMeta {
    /** The id of the function (operation) to be compiled (isType, typeErrors, toJsonVal, fromJsonVal, etc) */
    readonly fnID: string;
    /** Unique id of the function */
    readonly jitFnHash: string;
    readonly args: JitFnArgs;
    /**
     * This flag is set to true when the result of a jit compilation is a no operation (empty function).
     * if this flag is set to true, the function should not be called as it will not do anything.
     */
    readonly isNoop?: boolean;
    /** When creating the function it might have default values */
    readonly defaultParamValues: Record<keyof JitFnArgs, any>;
    /** Code for the jit function. after the operation has been compiled */
    readonly code: string;
    /** The list of all jit functions that are used by this function and it's children. */
    readonly dependenciesSet: Set<string>;
    readonly pureFnDependencies: Set<string>;

    paramNames?: string[];
}

export type SerializableJitCompiledFnMeta = Omit<JitCompiledFnMeta, 'dependenciesSet' | 'pureFnDependencies'> & {
    dependenciesSet: string[];
    pureFnDependencies: string[];
};

// ########################################### JIT FUNCTIONS ###########################################

export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnMeta {
    /** The Jit Generated function once the compilation is finished */
    readonly fn: Fn;
}
export interface JITCompiledFunctions {
    isType: JitCompiledFn<IsTypeFn>;
    typeErrors: JitCompiledFn<TypeErrorsFn>;
    toJsonVal: JitCompiledFn<ToJsonValFn>;
    fromJsonVal: JitCompiledFn<FromJsonValFn>;
    jsonStringify: JitCompiledFn<JsonStringifyFn>;
}
export interface SerializableJITFunctions {
    isType: SerializableJitCompiledFnMeta;
    typeErrors: SerializableJitCompiledFnMeta;
    toJsonVal: SerializableJitCompiledFnMeta;
    fromJsonVal: SerializableJitCompiledFnMeta;
    jsonStringify: SerializableJitCompiledFnMeta;
}
export type JsonStringifyFn = (value: any) => JSONString;
export type FromJsonValFn = (value: JSONValue) => any;
export type ToJsonValFn = (value: any) => JSONValue;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type IsTypeFn = (value: any) => boolean;
export type toCodeFn = (value: any) => string;
