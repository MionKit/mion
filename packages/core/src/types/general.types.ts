/* eslint-disable @typescript-eslint/no-unsafe-function-type */
/* ###############
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import {MIME_TYPES} from '../constants.ts';
import type {RTValidationError, DataOnly as RtDataOnly} from '@ts-runtypes/core';
import {CompiledPureFunction, PersistedPureFunction, PureFunctionData} from './pureFunctions.types.ts';

// ########################################## Serialization Modes ##########################################

export const SerializerModes = {
    /** Use prepareForJson (mutates original objects), and leaves JSON.stringify to the platform adapter */
    json: 1,
    /** Use toBinary JIT function for binary serialization */
    binary: 2,
    /** Use stringifyJson JIT function that do not mutates objects. */
    stringifyJson: 3,
    /** Client-only: sends plain JSON without JIT, fetches metadata in the same response */
    optimistic: 4,
} as const;

/**
 * Serializer mode for response body serialization.
 * - 'json': Use prepareForJson, platform adapter handles JSON.stringify
 * - 'binary': Use toBinary JIT function for binary serialization
 * - 'stringifyJson': Use stringifyJson JIT function that do not mutates objects.
 */
export type SerializerMode = keyof typeof SerializerModes;
export type SerializerCode = (typeof SerializerModes)[SerializerMode];

// ########################################## Options ##########################################

export type CoreRouterOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** basePath for all routes */
    basePath: string;
    /** suffix for all routes, ie file extension etc */
    suffix: string;
};

// ##########################################  Errors ##########################################

/** Base parameters for TypedError */
export interface TypedErrorParams<ErrType extends StrNumber> {
    /** Error type, can be used as discriminator in union types switch, etc*/
    type: ErrType;
    /** the error message */
    message?: string;
    /** original error used to create the TypedError */
    originalError?: Error;
}

/** Any error triggered by middleFns or routes must follow this interface, returned errors in the body also follows this interface */
export interface RpcErrorParams<ErrType extends StrNumber, ErrData = any> {
    /** Error type, can be used as discriminator in union types switch, etc*/
    type: ErrType;
    /** id of the error. */
    id?: number | string;
    /** the message that will be returned in the response */
    publicMessage?: string;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: string;
    /** options data related to the error, ie validation data */
    errorData?: ErrData;
    /** original error used to create the RpcError */
    originalError?: Error;
    /** optional http status code */
    statusCode?: number;
}

export interface RpcErrorWithPublic<ErrType extends StrNumber, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    publicMessage: string;
}

export interface RpcErrorWithPrivate<ErrType extends StrNumber, ErrData = any> extends RpcErrorParams<ErrType, ErrData> {
    message: string;
}

/** Error data returned to the clients  */
export interface PublicRpcError<ErrType extends StrNumber, ErrData = any> extends Omit<
    RpcErrorParams<ErrType, ErrData>,
    'message' | 'originalError'
> {
    readonly 'mion@isΣrrθr': true;
    type: ErrType;
    errorData?: ErrData;
    /**
     * When a RpcError gets sent to client only publicMessage is set.
     * */
    publicMessage: string;
}

export type AnyErrorParams<ErrType extends StrNumber, ErrData = any> =
    | RpcErrorWithPublic<ErrType, ErrData>
    | RpcErrorWithPrivate<ErrType, ErrData>;

/** A validation error from `createGetValidationErrors`, mion's public error-data shape (rides
 *  `ValidationErrorData.typeErrors` and the client error unions). Aliases @ts-runtypes/core's
 *  `RTValidationError` (the type the validators actually produce): `{path, expected, format?}`.
 *  mion never constructs these, only forwards them, so the alias is exact and lossless. */
export type RunTypeError = RTValidationError;

// ########################################### JIT FUNCTIONS ###########################################

/**
 * The argument names of the function to be compiled. The order of properties is important as must the same as the function args.
 * ie: {vλl: 'val', arg1: 'arg1', error: 'newRunTypeErr'} for the function (vλl, arg1, eArr) => any
 */
export type JitFnArgs = {
    /** The name of the value of to be */
    vλl: string;
    /** Other argument names */
    [key: string]: string;
};

export interface JitCompiledFnData {
    readonly typeName: string;
    /** The id of the function (operation) to be compiled (isType, typeErrors, prepareForJson, restoreFromJson, etc) */
    readonly fnID: string;
    /** Unique id of the function */
    readonly jitFnHash: string;
    /** The names of the arguments of the function */
    readonly args: JitFnArgs;
    /** Default values for the arguments */
    readonly defaultParamValues: JitFnArgs;
    /**
     * This flag is set to true when the result of a jit compilation is a no operation (empty function).
     * if this flag is set to true, the function should not be called as it will not do anything.
     */
    readonly isNoop?: boolean;
    /** Code for the jit function. after the operation has been compiled */
    readonly code: string;
    /** The list of all jit functions that are used by this function and it's children. */
    readonly jitDependencies?: Array<string>;
    /** Pure function dependencies in format "namespace::fnHash" */
    readonly pureFnDependencies?: Array<string>;
}

export interface JitCompiledFn<Fn extends AnyFn = AnyFn> extends JitCompiledFnData {
    /** The closure function that contains the jit function, this one contains the context code */
    readonly createJitFn: (utl: unknown) => Fn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: Fn;
}

/** Jit Functions serialized to src code file, it contains the create jit function
 * but not the actual fn as this one can not be serialized to code.
 */
export interface PersistedJitFn extends Omit<JitCompiledFn, 'fn'> {
    /** The Jit Generated function once the compilation is finished */
    readonly fn: undefined;
}

export interface JitCompiledFunctions {
    isType: JitCompiledFn<IsTypeFn>;
    typeErrors: JitCompiledFn<TypeErrorsFn>;
    prepareForJson: JitCompiledFn<PrepareForJsonFn>;
    restoreFromJson: JitCompiledFn<RestoreFromJsonFn>;
    stringifyJson: JitCompiledFn<JsonStringifyFn>;
    /** strictTypes support: true when the value carries properties not present in the type */
    hasUnknownKeys?: JitCompiledFn<HasUnknownKeysFn>;
    /** strictTypes support: RunTypeError entries for every unknown property found */
    unknownKeyErrors?: JitCompiledFn<TypeErrorsFn>;
    toBinary?: JitCompiledFn<ToBinaryFn>;
    fromBinary?: JitCompiledFn<FromBinaryFn>;
}
export interface SerializableJITFunctions {
    isType: JitCompiledFnData;
    typeErrors: JitCompiledFnData;
    prepareForJson: JitCompiledFnData;
    restoreFromJson: JitCompiledFnData;
    stringifyJson: JitCompiledFnData;
    toBinary?: JitCompiledFnData;
    fromBinary?: JitCompiledFnData;
}
export interface JitFunctionsHashes {
    isType: string;
    typeErrors: string;
    prepareForJson: string;
    restoreFromJson: string;
    stringifyJson: string;
    hasUnknownKeys?: string;
    unknownKeyErrors?: string;
    toBinary?: string;
    fromBinary?: string;
}
export type JsonStringifyFn = (value: any) => JSONString;
export type RestoreFromJsonFn = (value: JSONValue) => any;
export type PrepareForJsonFn = (value: any) => JSONValue;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type IsTypeFn = (value: any) => boolean;
export type HasUnknownKeysFn = (value: any) => boolean;
export type ToCodeFn = (value: any) => string;
/** Binary serialization function - serializes value to the serializer context */
export type ToBinaryFn = (value: any, serializer: DataViewSerializer) => void;
/** Binary deserialization function - deserializes from the deserializer context and returns the value */
export type FromBinaryFn = (value: undefined, deserializer: DataViewDeserializer) => any;

// ############################# JIT CACHES ###################################

// jit and pure functions at runtime, contains both createJitFn and fn
export type JitFunctionsCache = Record<string, JitCompiledFn>;
/** Namespaced cache structure for pure functions: { namespace: { fnHash: CompiledPureFunction } } */
export type PureFunctionsCache = Record<string, Record<string, CompiledPureFunction>>;

// jit and pure functions persisted to src code, contains createJitFn but not fn
// this allow usage in environments that can not use eval or new Function()
export type PersistedJitFunctionsCache = Record<string, PersistedJitFn>;
/** Namespaced cache structure for persisted pure functions */
export type PersistedPureFunctionsCache = Record<string, Record<string, PersistedPureFunction>>;

// jit and pure functions data, does not contain createJitFn or fn
// this is used to serialize over the network, but requires using new Function() to restore functionality
export type FnsDataCache = Record<string, JitCompiledFnData>;
/** Namespaced cache structure for pure function data */
export type PureFnsDataCache = Record<string, Record<string, PureFunctionData>>;

// ########################################### JIT SRC CODE ####################################

export interface SrcCodeJitCompiledFn extends JitCompiledFnData {
    /** The closure function that contains the jit function, this one contains the context code */
    readonly createJitFn: (utl: unknown) => AnyFn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: undefined;
}
export interface SrcCodeCompiledPureFunction extends PureFunctionData {
    /** The closure function that contains the pure function, this one contains the context code */
    readonly createPureFn: (utl: unknown) => AnyFn;
    /** The Jit Generated function once the compilation is finished */
    readonly fn: undefined;
}
export type SrcCodeJITCompiledFnsCache = Record<string, SrcCodeJitCompiledFn>;
export type SrcCodePureFunctionsCache = Record<string, Record<string, SrcCodeCompiledPureFunction>>;

/** Client version of SrcCodeJitCompiledFn - strips unused properties to reduce bundle size */
export type ClientSrcCodeJitCompiledFn = Omit<SrcCodeJitCompiledFn, 'code' | 'args' | 'defaultParamValues' | 'fnID'>;
/** Client version of SrcCodeCompiledPureFunction - strips unused properties to reduce bundle size */
export type ClientSrcCodeCompiledPureFunction = Omit<SrcCodeCompiledPureFunction, 'code' | 'paramNames'>;
export type ClientSrcCodeJITCompiledFnsCache = Record<string, ClientSrcCodeJitCompiledFn>;
export type ClientSrcCodePureFunctionsCache = Record<string, Record<string, ClientSrcCodeCompiledPureFunction>>;

// ########################################## other #########################################

export type StrNumber = string | number;
export type AnyFn = (...args: any[]) => any;
export type AnyObject = Record<string, unknown>;
export interface AnyClass<T = any> {
    new (...args: any[]): T;
}

export interface SerializableClass<T = any> {
    new (): T;
}

export type DeserializeClassFn<C extends InstanceType<AnyClass>> = (deserialized: DataOnly<C>) => C;

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};

export type Prettify<T> = {
    [P in keyof T]: T[P];
} & {};

// StrNumber is already defined at the top of the file
export type JSONValue = StrNumber | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

/** Data-only projection of T (strips methods, keeps serializable properties). Aliases
 *  @ts-runtypes/core's DataOnly — the exact type mion's decoders return — so mion's public
 *  DataOnly matches decoder output. (mion's former hand-rolled mirror was removed.) */
export type DataOnly<T> = RtDataOnly<T>;

// TEST TYPES FOR PlainObject

// class A {
//     n1?: number;
//     s?: string;
//     d?: Date;
//     map?: Map<string, RegExp>;
//     set?: Set<URL>;
//     arr?: A[];
//     method() {
//         return 'hello';
//     }
//     arrow = () => 'hello';
// }

// type PlainInterface = PlainObject<{
//     n1: number;
//     s: string;
//     d: Date;
//     a: A;
//     map: Map<string, A>;
//     set: Set<A>;
//     arr: A[];
//     method(): string;
//     arrow: () => string;
// }>;

// type PlainClass = PlainObject<A>;
// type PlainSet = PlainObject<Set<A>>;
// type PlainMap = PlainObject<Map<string, A>>;

// ################# BINARY SERIALIZATION - IMPORTANT NOTE ##################################
// DO NOT CHANGE THE INTERFACE NAMES AS THEY ARE HARDCODED IN THE JIT GENERATED CODE
// ##########################################################################################

export type StrictArrayBuffer = ArrayBuffer & {buffer?: undefined};
/** Input type for binary deserialization - accepts ArrayBuffer or any typed array view (including Node.js Buffer) */
export type BinaryInput = ArrayBuffer | ArrayBufferView;
export interface DataViewSerializer {
    index: number; // byte offset
    view: DataView;
    reset: () => void;
    getBuffer: () => StrictArrayBuffer;
    getBufferView: () => Uint8Array;
    markAsEnded: () => void;
    getLength(): number;
    // serialization functions
    serString(str: string): void;
    serFloat64(n: number): void;
    serEnum(n: number | string): void;
    setBitMask(bitMaskIndex: number, bitIndex: number): void;
}

export interface DataViewDeserializer {
    index: number; // byte offset
    view: DataView;
    reset: () => void;
    setBuffer: (buffer: StrictArrayBuffer, byteOffset?: number, byteLength?: number) => void;
    markAsEnded: () => void;
    getLength(): number;
    // deserialization functions
    desString(): string;
    desFloat64(): number;
    desEnum(): number | string;
}

export type MimeTypes = (typeof MIME_TYPES)[keyof typeof MIME_TYPES];
