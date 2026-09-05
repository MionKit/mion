/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, JsonStrategy, ResolvedSerializer, SerializerDirection} from './types/general.types.ts';
import {getFnHash, type FnHashKey} from '@mionjs/run-types';

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
  /** Platform or adapters errors that occur before reaching the router or outside the router and are platform/adapter related */
  platformError: 'mion@platformError',
  /** not-found route. This route is called when a requested route doesn't exist */
  notFound: 'mion@notFound',
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
 * Only json and binary are supported out of the box.
 */
export const MIME_TYPES = {
  json: 'application/json',
  octetStream: 'application/octet-stream',
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
 * Per-function cache-key prefixes, DERIVED from RunTypes' `getFnHash` (no hardcoding).
 * Each entry is the `<fnHash>` half of the mion runtime cache key `<fnHash>_<typeId>`
 * (see src/runtypes/mionAdapter), keyed by mion's family name and mapped to the
 * mion fn key. Since RunTypes 0.9.3 the fnHash salt no longer folds the binary
 * version, so these prefixes are STABLE across releases and `getFnHash` reads them from
 * mion' Go-generated table (the single source of truth) — a version bump needs NO
 * refresh here (the `<typeId>` half still carries the version for cache invalidation). The
 * prefixes are TYPE-INDEPENDENT (family + default options only), so one value per family
 * covers every type.
 */
export const JIT_FUNCTION_IDS = {
  isType: getFnHash('val'),
  typeErrors: getFnHash('verr'),
  hasUnknownKeys: getFnHash('huk'), // strictTypes
  unknownKeyErrors: getFnHash('uke'), // strictTypes
  toBinary: getFnHash('tb'),
  fromBinary: getFnHash('fb'),
  formatTransform: getFnHash('fmt'), // sanitizeParams
} as const;

/** The family each JSON strategy compiles on the ENCODE side (value out) and on the DECODE side (value back). The
 *  three key-based strategies share one restore family; `compact` needs its positional twin. */
export const JSON_ENCODE_TAG = {clone: 'pjs', mutate: 'pj', direct: 'sj', compact: 'cj'} as const satisfies Record<
  JsonStrategy,
  FnHashKey
>;
export const JSON_DECODE_TAG = {clone: 'rj', mutate: 'rj', direct: 'rj', compact: 'cjr'} as const satisfies Record<
  JsonStrategy,
  FnHashKey
>;
export type JsonEncodeTag = (typeof JSON_ENCODE_TAG)[JsonStrategy];
export type JsonDecodeTag = (typeof JSON_DECODE_TAG)[JsonStrategy];
/** The strategy a compiled fn set was built for, read off the encode family it carries. */
export const STRATEGY_BY_ENCODE_TAG: Readonly<Record<JsonEncodeTag, JsonStrategy>> = {
  pjs: 'clone',
  pj: 'mutate',
  sj: 'direct',
  cj: 'compact',
};
/** The tags of the binary pair; both or neither are ever present on a fn set. */
export const BINARY_TAGS = {toBinary: 'tb', fromBinary: 'fb'} as const;
/** The `<fnHash>` half of every JSON family's cache key, keyed by family tag. */
export const JSON_FAMILY_HASH: Readonly<Record<JsonEncodeTag | JsonDecodeTag, string>> = {
  pjs: getFnHash('pjs'),
  pj: getFnHash('pj'),
  sj: getFnHash('sj'),
  cj: getFnHash('cj'),
  rj: getFnHash('rj'),
  cjr: getFnHash('cjr'),
};
/** What a method compiles when neither it nor the router names a strategy: today's wire. The client stringifies its
 *  params (`direct`) and the server prepares its return in place (`mutate`) for the platform to stringify. A `binary`
 *  direction keeps THIS pair beside tb / fb (never the router default), so a plain-JSON request still decodes. */
export const BUILT_IN_JSON_STRATEGY: Readonly<Record<SerializerDirection, JsonStrategy>> = Object.freeze({
  params: 'direct',
  return: 'mutate',
});
export const BUILT_IN_SERIALIZER: Readonly<ResolvedSerializer> = BUILT_IN_JSON_STRATEGY;

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';
// Type formats are entirely a RunTypes concern — mion owns no format vocabulary of its own
// and re-exports none. Import `typeFormats` / `FormatName` from @mionjs/run-types directly.
