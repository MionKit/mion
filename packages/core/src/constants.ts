/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, SerializerStrategy} from './types/general.types.ts';

export const DEFAULT_CORE_OPTIONS: CoreRouterOptions = {
  /** automatically generate and uuid */
  autoGenerateErrorId: false,
  basePath: '',
  suffix: '',
};

export const PATH_SEPARATOR = '/';
export const ROUTE_PATH_ROOT = PATH_SEPARATOR;
export const ROUTER_ITEM_SEPARATOR_CHAR = '/';
export const MAX_STACK_DEPTH = 50;
/** The request body limit every platform adapter defaults to, in bytes: what a route takes when its
 *  own `maxBodySize` option is unset and its params types cannot say how big a body can be. Every
 *  hosted platform allows far more (Vercel 4.5 MB, AWS Lambda 6 MB, Google Cloud 10 MB and up,
 *  Cloudflare 100 MB and up), so this is a deliberate floor, not a platform ceiling. */
export const DEFAULT_MAX_BODY_SIZE = 128_000;

/** Reserved route name of the batch endpoint: a batch request is `POST <basePath>/mion-batch?id=<batchId>` */
export const MION_BATCH_KEY = 'mion-batch';
export const MION_BATCH_PATH = `${PATH_SEPARATOR}${MION_BATCH_KEY}`;

/**
 * Mion internal routes.
 */
export const MION_ROUTES = {
  /** get remote methods metadata by method id */
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
  /**
   * !IMPORTANT!!
   * This is technically not a route, but a special key used to store unexpected errors in the response body.
   * is declared as a route to reuse existing router serialization/deserialization logic.
   * Errors thrown by routes/middleFns, these are not strongly typed
   * */
  thrownErrors: '@thrownErrors',
} as const;

/**
 * Mime types used by mion.
 */
export const MIME_TYPES = {
  json: 'application/json',
} as const;

/**
 * Standard HTTP status codes used by mion.
 * Status codes are a bit irrelevant in mion apps, the important part is the error type, that is a human readable code.
 * They are used mostly for backwards compatibility with HTTP.
 */
export const StatusCodes = {
  /** Any error in the server that is not related to the application, ie: server not ready, etc... */
  SERVER_ERROR: 500,
  /** Any expected and strongly typed error returned by a route/middleFn. ie: entity not found, etc. */
  APPLICATION_ERROR: 400,
  /**  Any thrown or unexpected error in the application, ie: validation error, not found, etc, database error, serialization error, etc...
   * These are are typically irrecoverable and can be handled globally, ie redirect to login page if auth fails
   */
  UNEXPECTED_ERROR: 422,
  /** Not found error */
  NOT_FOUND: 404,
  /** The request body (or the query body) is larger than the configured maxBodySize */
  PAYLOAD_TOO_LARGE: 413,
  /** Standard success code */
  OK: 200,
} as const;

export const HandlerType = {
  route: 1,
  middleFn: 2,
  headersMiddleFn: 3,
  rawMiddleFn: 4,
} as const;

/**
 * The `<fnHash>` half of the runtime cache key `<fnHash>_<typeId>` (see src/runtypes/mionAdapter),
 * one per family: TYPE-INDEPENDENT, and stable across releases since the salt dropped the binary version.
 * Written out rather than derived: `getFnHash` shipped the whole Go-generated hash table to every browser.
 * constants.jitFunctionIds.spec.ts fails if a value drifts from `getFnHash`.
 */
export const JIT_FUNCTION_IDS = {
  isType: 'Eq2V',
  typeErrors: 'swxg',
  hasUnknownKeys: 'GsPX', // strictTypes
  unknownKeyErrors: 'r8yS', // strictTypes
  formatTransform: 'mzca', // sanitizeParams
  // the JSON families, one encoder per strategy and the two decoders (see ENCODE_FAMILY_BY_STRATEGY)
  prepareForJsonClone: 'A0Qb',
  prepareForJsonMutate: 'AwYs',
  compactForJson: 'rpEK',
  restoreFromJsonMutate: 'w8ie',
  restoreFromJsonClone: 'Ky89',
  compactFromJson: 'FFsn',
} as const satisfies Record<string, string>;

/** The compiled family each strategy ENCODES with, named by its MARKER token (the name a route's
 *  InjectTypeFnArgs asks for), not by the short tag the compiled entry carries: `clone` builds a
 *  new JSON-safe value, `mutate` transforms in place, `compact` builds the positional array. */
export const ENCODE_FAMILY_BY_STRATEGY = {
  clone: 'prepareForJsonClone',
  mutate: 'prepareForJsonMutate',
  compact: 'compactForJson',
} as const;
/** The compiled family each strategy DECODES with, one entry per SIDE. The two sides do not face
 *  the same problem: the server decodes params from any caller, so it rebuilds the declared shape
 *  unless the strategy's whole point is passing the object through; the client decodes a return
 *  its own server wrote, and never hands its caller a key the return type does not declare. */
export const DECODE_FAMILY_BY_STRATEGY = {
  clone: {server: 'restoreFromJsonClone', client: 'restoreFromJsonClone'},
  mutate: {server: 'restoreFromJsonMutate', client: 'restoreFromJsonClone'},
  compact: {server: 'compactFromJson', client: 'compactFromJson'},
} as const;
/** Reverse of ENCODE_FAMILY_BY_STRATEGY: what strategy an injected encode family tells. */
export const STRATEGY_BY_ENCODE_FAMILY = {
  prepareForJsonClone: 'clone',
  prepareForJsonMutate: 'mutate',
  compactForJson: 'compact',
} as const;
/** Params are decoded by the server and a return by the client, so the direction names the machine. */
export const DECODE_SIDE_BY_DIRECTION = {params: 'server', return: 'client'} as const;
export type DecodeSide = (typeof DECODE_SIDE_BY_DIRECTION)[keyof typeof DECODE_SIDE_BY_DIRECTION];
export type EncodeFamily = (typeof ENCODE_FAMILY_BY_STRATEGY)[keyof typeof ENCODE_FAMILY_BY_STRATEGY];
export type DecodeFamily = (typeof DECODE_FAMILY_BY_STRATEGY)[SerializerStrategy][DecodeSide];

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';
// Type formats are entirely a RunTypes concern — mion owns no format vocabulary of its own
// and re-exports none. Import `typeFormats` / `FormatName` from @mionjs/run-types directly.
