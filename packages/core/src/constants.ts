/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, ParserDirection, ParserStrategy} from './types/general.types.ts';
// Generated from the Go operation registry beside run-types' full variant table, so the two cannot drift.
// Re-exported because every consumer reaches it through @mionjs/core, never through the generated path.
export {JIT_FUNCTION_IDS} from './go-generated/jitFunctionIds.generated.ts';

export const DEFAULT_CORE_OPTIONS: CoreRouterOptions = {
  autoGenerateErrorId: false,
  basePath: '',
  suffix: '',
};

export const PATH_SEPARATOR = '/';
export const ROUTE_PATH_ROOT = PATH_SEPARATOR;
export const ROUTER_ITEM_SEPARATOR_CHAR = '/';
export const MAX_STACK_DEPTH = 50;
/** Body limit in bytes when a route sets no `maxBodySize` and its params types give no maximum.
 *  A deliberate floor, not a platform ceiling: every hosted platform allows far more (Vercel 4.5 MB, AWS 6 MB). */
export const DEFAULT_MAX_BODY_SIZE = 128_000;

/** Reserved route name of the batch endpoint: a batch request is `POST <basePath>/mion-batch?id=<batchId>` */
export const MION_BATCH_KEY = 'mion-batch';
export const MION_BATCH_PATH = `${PATH_SEPARATOR}${MION_BATCH_KEY}`;

/** Mion internal routes. */
export const MION_ROUTES = {
  methodsMetadataById: 'mion@methodsMetadataById',
  /** Middleware that returns methods metadata alongside any route response */
  methodsMetadata: 'mion@methodsMetadata',
  /** Errors raised by an adapter rather than a handler: before the router sees the request, or after
   *  the route resolved (a body the adapter refused) */
  platformError: 'mion@platformError',
  /** not-found chain, answered when a requested path names no route */
  notFound: 'mion@notFound',
  /** not-found chain for a batch request whose id names no registered batch */
  batchNotFound: 'mion@batchNotFound',
  /** Not a route: the key untyped thrown errors are stored under, declared here to reuse the router's serialization. */
  thrownErrors: '@thrownErrors',
} as const;

export const MIME_TYPES = {
  json: 'application/json',
} as const;

/** Kept for HTTP backwards compatibility only: in a mion app the error type, a human readable code, is what matters. */
export const StatusCodes = {
  /** Any error in the server that is not related to the application, ie: server not ready, etc... */
  SERVER_ERROR: 500,
  /** Any expected and strongly typed error returned by a route/middleFn. ie: entity not found, etc. */
  APPLICATION_ERROR: 400,
  /** Any thrown or unexpected error, typically irrecoverable and handled globally, ie redirect to login when auth fails. */
  UNEXPECTED_ERROR: 422,
  NOT_FOUND: 404,
  /** The request body (or the query body) is larger than the configured maxBodySize */
  PAYLOAD_TOO_LARGE: 413,
  OK: 200,
} as const;

export const HandlerType = {
  route: 1,
  middleFn: 2,
  headersMiddleFn: 3,
  rawMiddleFn: 4,
} as const;

// ###################### What each parser strategy compiles ######################
// One row per strategy per WIRE, holding every family that wire needs, named by the MARKER token a route's
// InjectTypeFnArgs asks for rather than the short tag the compiled entry carries. A row IS the marker's slot
// list, so adding a strategy is one row here and one row in the Go mirror (resolver/apigen.go), never an edit
// spread over four maps keyed four different ways.

/** The PARAMS wire: the client encodes, the server decodes and validates.
 *
 *  The validator differs per strategy because the decoder does. `clone` and `compact` rebuild the declared shape
 *  as they decode, so only a union can still hide a key; `mutate` rebuilds nothing and is the permissive
 *  strategy; `mutateStrict` rebuilds nothing either and answers for every key, which needs the fused validator. */
export const PARAMS_PARSING = {
  clone: {
    encode: 'prepareForJsonClone',
    decode: 'restoreFromJsonClone',
    validate: 'validateUnionKeys',
    validationErrors: 'validationErrorsUnionKeys',
  },
  mutate: {
    encode: 'prepareForJsonMutate',
    decode: 'restoreFromJsonMutate',
    validate: 'validate',
    validationErrors: 'validationErrors',
  },
  mutateStrict: {
    // Same JSON pair as `mutate`; the validator is the whole difference.
    encode: 'prepareForJsonMutate',
    decode: 'restoreFromJsonMutate',
    validate: 'validateStrict',
    validationErrors: 'validationErrorsStrict',
  },
  compact: {
    encode: 'compactForJson',
    decode: 'compactFromJson',
    validate: 'validateUnionKeys',
    validationErrors: 'validationErrorsUnionKeys',
  },
} as const;

/** The RETURN wire: the server encodes, the client decodes and validates.
 *
 *  Every row validates with the plain pair: a return is written by your own handler, never by a caller, so there
 *  is no undeclared key to answer for. `mutateStrict` has NO ROW, which is what makes it params-only, and the
 *  client's decoder always rebuilds the declared shape so it never hands an undeclared key on. */
export const RETURN_PARSING = {
  clone: {
    encode: 'prepareForJsonClone',
    decode: 'restoreFromJsonClone',
    validate: 'validate',
    validationErrors: 'validationErrors',
  },
  mutate: {
    encode: 'prepareForJsonMutate',
    decode: 'restoreFromJsonClone',
    validate: 'validate',
    validationErrors: 'validationErrors',
  },
  compact: {
    encode: 'compactForJson',
    decode: 'compactFromJson',
    validate: 'validate',
    validationErrors: 'validationErrors',
  },
} as const;

export type ParamsParsing = typeof PARAMS_PARSING;
export type ReturnParsing = typeof RETURN_PARSING;
/** The families one wire compiles, whichever direction it is. */
export type ParsingRow = ParamsParsing[keyof ParamsParsing] | ReturnParsing[keyof ReturnParsing];

/** The row a direction's strategy compiles. A return strategy is narrower, so the cast is what the
 *  ReturnParserStrategy type already guarantees. */
export function parsingRow(strategy: ParserStrategy, direction: ParserDirection): ParsingRow {
  return direction === 'return' ? RETURN_PARSING[strategy as keyof ReturnParsing] : PARAMS_PARSING[strategy];
}

/** Params are decoded by the server and a return by the client, so the direction names the machine. */
export const DECODE_SIDE_BY_DIRECTION = {params: 'server', return: 'client'} as const;
export type DecodeSide = (typeof DECODE_SIDE_BY_DIRECTION)[keyof typeof DECODE_SIDE_BY_DIRECTION];
export type EncodeFamily = ParsingRow['encode'];
export type DecodeFamily = ParsingRow['decode'];
export type ValidateFamily = ParsingRow['validate'];

/** Used when no params exist or the return type is void: no JIT functions are generated. */
export const EMPTY_HASH = '';
// mion owns no format vocabulary and re-exports none: import `typeFormats` / `FormatName` from @mionjs/run-types.
