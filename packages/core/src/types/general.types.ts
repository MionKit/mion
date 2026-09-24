/* ###############
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ############### */

import type {RTValidationError, DataOnly as RtDataOnly} from '@mionjs/run-types';
import {SerializablePureFunction} from './pureFunctions.types.ts';

// ########################################## Parser strategies ##########################################
// One strategy per direction, naming the families PARSE_MODES compiles. A BUILD-TIME literal.

/** RunTypes also offers `direct`; mion does not, it costs 3x the memory of `clone` and 2x the time for identical bytes.
 *  Written out rather than `Exclude`d from the RunTypes union: a conditional here is paid once per route. */
export type ParserStrategy = 'clone' | 'mutate' | 'mutateStrict' | 'compact';
/** `mutateStrict` is PARAMS ONLY: a return is written by your own handler, so there is no caller key left to reject. */
export type ReturnParserStrategy = 'clone' | 'mutate' | 'compact';
/** One strategy per direction, either optional. An interface: cheaper in the type budget than a literal. */
export interface ParserPair {
  params?: ParserStrategy;
  return?: ReturnParserStrategy;
}
/** A bare string sets BOTH directions, so it cannot be `mutateStrict`: write `{params: 'mutateStrict'}`. */
export type ParserOption = ReturnParserStrategy | ParserPair;
/** The resolved per-direction pair every executable carries and the methods metadata ships. */
export interface ResolvedParser {
  params: ParserStrategy;
  return: ReturnParserStrategy;
}
// NOT the `parser` strategy: these name how the BODY is framed on the wire, same word, different concept.
export const SerializerModes = {
  /** the request body is an object the host already parsed */
  json: 1,
  /** the body is a JSON string: every request body, and what the client sends */
  stringifyJson: 3,
  /** Client-only: sends plain JSON without compiled functions, fetches metadata in the same response */
  optimistic: 4,
} as const;

export type SerializerMode = keyof typeof SerializerModes;
export type SerializerCode = (typeof SerializerModes)[SerializerMode];

// ########################################## Options ##########################################

export type CoreRouterOptions = {
  /** generate an id for every error */
  autoGenerateErrorId: boolean;
  /** basePath for all routes */
  basePath: string;
  /** suffix for all routes, ie file extension etc */
  suffix: string;
};

// ##########################################  Errors ##########################################

export interface TypedErrorParams<ErrType extends StrNumber> {
  /** Error type, can be used as discriminator in union types switch, etc*/
  type: ErrType;
  message?: string;
  /** original error used to create the TypedError */
  originalError?: Error;
}

/** Any error triggered by middlewares or routes must follow this interface, returned errors in the body also follows this interface */
export interface RpcErrorParams<ErrType extends StrNumber, ErrData = any> {
  /** Error type, can be used as discriminator in union types switch, etc*/
  type: ErrType;
  id?: number | string;
  /** the message that will be returned in the response */
  publicMessage?: string;
  /** private message, never returned in the response; falls back to originalError.message or publicMessage. */
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
  /** When an RpcError is sent to a client, only publicMessage is set. */
  publicMessage: string;
}

export type AnyErrorParams<ErrType extends StrNumber, ErrData = any> =
  | RpcErrorWithPublic<ErrType, ErrData>
  | RpcErrorWithPrivate<ErrType, ErrData>;

/** mion's public error-data shape, carried by `ValidationErrorData.typeErrors` and the client error unions.
 *  Aliases @mionjs/run-types's `RTValidationError`, the type the validators produce; mion only forwards them. */
export type RunTypeError = RTValidationError;

// ########################################### JIT FUNCTIONS ###########################################

/** mion's JIT function vocabulary IS RunTypes' compiled-fn model: `CompiledFnData` is the closure-free wire
 *  form the router ships to the client and `CompiledTypeFn` adds the restored `createRTFn`/`fn`. The client
 *  rebuilds a fn with `buildFactoryFromCode(code)` and registers it back through `getRTUtils().addToRTCache`. */
import type {CompiledFnData, CompiledTypeFn, CompiledFnArgs, InitializedTypeFn} from '@mionjs/run-types';
export type {CompiledFnData, CompiledTypeFn, CompiledFnArgs, InitializedTypeFn};

/** A compiled type fn as mion consumes it: a narrowing of RunTypes' own types, not a mirror.
 *  `createRTFn`/`fn` are guaranteed by `InitializedTypeFn`, what `getRTUtils().getRT()` already returns.
 *  `code` is guaranteed only because mion restricts `emitMode` to 'code' | 'both' and the vite plugin throws
 *  on 'functions', the one mode where RunTypes omits it; that is what makes the construction sites' assert sound. */
export type MionTypeFn<Fn extends AnyFn = AnyFn> = InitializedTypeFn<Fn> & Required<Pick<CompiledFnData, 'code'>>;

/** The JSON pair compiled for ONE strategy and ONE direction. */
export interface JitJsonFunctions {
  strategy: ParserStrategy;
  encode: MionTypeFn<JsonEncodeFn>;
  decode: MionTypeFn<JsonDecodeFn>;
}
export interface JitCompiledFunctions {
  isType: MionTypeFn<IsTypeFn>;
  typeErrors: MionTypeFn<TypeErrorsFn>;
  /** sanitizeParams support: applies the rewrites declared under a format's `transform` key
   *  (trim / case / replace / stripSeparators) in place. Only present on a PARAMS fn set whose
   *  type declares a transform; never on a return fn set. */
  formatTransform?: MionTypeFn<FormatTransformFn>;
  json: JitJsonFunctions;
}
/** The mion cache keys (`<fnHash>_<typeId>`) of one fn set, flat so the deps lane can walk them. */
export interface JitFunctionsHashes {
  isType: string;
  typeErrors: string;
  encode: string;
  decode: string;
  formatTransform?: string;
}
export type JsonStringifyFn = (value: any) => JSONString;
export type RestoreFromJsonFn = (value: JSONValue) => any;
export type PrepareForJsonFn = (value: any) => JSONValue;
/** A compiled JSON encoder of any strategy. */
export type JsonEncodeFn = (value: any) => JSONValue;
export type JsonDecodeFn = RestoreFromJsonFn;
export type TypeErrorsFn = (value: any) => RunTypeError[];
export type IsTypeFn = (value: any) => boolean;
/** Format transform function: rewrites the value in place and returns it (identity when noop) */
export type FormatTransformFn = (value: any) => any;

// ############################# JIT CACHES ###################################

// The wire form: no createRTFn or fn, so restoring one needs new Function().
export type FnsDataCache = Record<string, CompiledFnData>;
/** Keyed by pure-fn id. Entries are `SerializablePureFunction`, not bare `PureFunctionData`: an entry that
 *  reaches the wire MUST carry `code`, since rebuilding it client-side is `new Function(...paramNames, code)`. */
export type PureFnsDataCache = Record<string, SerializablePureFunction>;

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

export type JSONValue = StrNumber | boolean | null | {[key: string]: JSONValue} | Array<JSONValue>;
export type JSONString = string;

/** Data-only projection of T (strips methods, keeps serializable properties). Aliases @mionjs/run-types's
 *  DataOnly, the exact type mion's decoders return, so the public DataOnly matches decoder output. */
export type DataOnly<T> = RtDataOnly<T>;
