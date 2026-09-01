/* ###############
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import type {RTValidationError, DataOnly as RtDataOnly} from '@mionjs/run-types';
import {SerializablePureFunction} from './pureFunctions.types.ts';

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

/** A validation error from `createGetValidationErrorsFn`, mion's public error-data shape (rides
 *  `ValidationErrorData.typeErrors` and the client error unions). Aliases @mionjs/run-types's
 *  `RTValidationError` (the type the validators actually produce): `{path, expected, format?}`.
 *  mion never constructs these, only forwards them, so the alias is exact and lossless. */
export type RunTypeError = RTValidationError;

// ########################################### JIT FUNCTIONS ###########################################

/** mion's JIT function vocabulary IS RunTypes' compiled-fn model — `CompiledFnData` is the
 *  closure-free wire form (what router ships to client) and `CompiledTypeFn` adds the restored
 *  `createRTFn`/`fn`. The client rebuilds a fn with `buildFactoryFromCode(code)` and registers it
 *  back via `getRTUtils().addToRTCache(...)`. mion's former CompiledFnData/CompiledTypeFn
 *  mirrors were deleted. */
import type {CompiledFnData, CompiledTypeFn, CompiledFnArgs, InitializedTypeFn} from '@mionjs/run-types';
export type {CompiledFnData, CompiledTypeFn, CompiledFnArgs, InitializedTypeFn};

/** A compiled type fn as mion consumes it. NOT a mirror — a narrowing of RunTypes' own types:
 *  - `createRTFn`/`fn` are guaranteed by `InitializedTypeFn`, which is what `getRTUtils().getRT()`
 *    already returns (it runs `materializeRTFn` before handing the entry back).
 *  - `code` is guaranteed because mion restricts `emitMode` to 'code' | 'both' and the vite plugin
 *    throws on 'functions' — the one mode where RunTypes deliberately omits it. Without that
 *    restriction `code` would be optional and every consumer would need a fallback.
 *  TypeScript cannot see the plugin-level guarantee, so the construction sites assert it; the
 *  assertion is only sound because of the emitMode restriction above. */
export type MionTypeFn<Fn extends AnyFn = AnyFn> = InitializedTypeFn<Fn> & Required<Pick<CompiledFnData, 'code'>>;

export interface JitCompiledFunctions {
  isType: MionTypeFn<IsTypeFn>;
  typeErrors: MionTypeFn<TypeErrorsFn>;
  prepareForJson: MionTypeFn<PrepareForJsonFn>;
  restoreFromJson: MionTypeFn<RestoreFromJsonFn>;
  stringifyJson: MionTypeFn<JsonStringifyFn>;
  /** strictTypes support: true when the value carries properties not present in the type */
  hasUnknownKeys?: MionTypeFn<HasUnknownKeysFn>;
  /** strictTypes support: RunTypeError entries for every unknown property found */
  unknownKeyErrors?: MionTypeFn<TypeErrorsFn>;
  toBinary?: MionTypeFn<ToBinaryFn>;
  fromBinary?: MionTypeFn<FromBinaryFn>;
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
/** Binary serialization function - serializes value to the serializer context */
export type ToBinaryFn = (value: any, serializer: DataViewSerializer) => void;
/** Binary deserialization function - deserializes from the deserializer context and returns the value */
export type FromBinaryFn = (value: undefined, deserializer: DataViewDeserializer) => any;

// ############################# JIT CACHES ###################################

// jit and pure functions data, does not contain createRTFn or fn
// this is used to serialize over the network, but requires using new Function() to restore functionality
export type FnsDataCache = Record<string, CompiledFnData>;
/** Namespaced cache structure for pure function data. Entries are `SerializablePureFunction`, not
 *  bare `PureFunctionData`: an entry that reaches the wire MUST carry `code`, because rebuilding it
 *  client-side is `new Function(...paramNames, code)` and nothing else. */
export type PureFnsDataCache = Record<string, Record<string, SerializablePureFunction>>;

// ########################################## other #########################################

export type StrNumber = string | number;
export type AnyFn = (...args: any[]) => any;
export type AnyObject = Record<string, unknown>;

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
 *  @mionjs/run-types's DataOnly — the exact type mion's decoders return — so mion's public
 *  DataOnly matches decoder output. (mion's former hand-rolled mirror was removed.) */
export type DataOnly<T> = RtDataOnly<T>;

// ################# BINARY SERIALIZATION - IMPORTANT NOTE ##################################
// DO NOT CHANGE THE INTERFACE NAMES AS THEY ARE HARDCODED IN THE JIT GENERATED CODE
// ##########################################################################################

// ⚠️ These interface NAMES are hardcoded in the JIT-generated code — re-exported under the
// SAME names from @mionjs/run-types (the codec that actually implements them). mion's former
// subset mirrors were deleted; every member it declared exists upstream verbatim.
import type {StrictArrayBuffer, BinaryInput, DataViewSerializer, DataViewDeserializer} from '@mionjs/run-types';
export type {StrictArrayBuffer, BinaryInput, DataViewSerializer, DataViewDeserializer};
