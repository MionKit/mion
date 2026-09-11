/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions} from './types/general.types.ts';
import {getFnHash} from '@mionjs/run-types';

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
  formatTransform: getFnHash('fmt'), // sanitizeParams
  // the JSON families, one encoder per strategy and the two decoders (see ENCODE_FAMILY_BY_STRATEGY)
  pjs: getFnHash('pjs'),
  pj: getFnHash('pj'),
  sj: getFnHash('sj'),
  cj: getFnHash('cj'),
  rj: getFnHash('rj'),
  cjr: getFnHash('cjr'),
} as const;

/** The compiled family (marker key) each JSON strategy ENCODES with: `clone` builds a new JSON-safe
 *  value, `mutate` transforms in place, `direct` writes the JSON string, `compact` builds the
 *  positional array. */
export const ENCODE_FAMILY_BY_STRATEGY = {clone: 'pjs', mutate: 'pj', direct: 'sj', compact: 'cj'} as const;
/** The compiled family each JSON strategy DECODES with: only `compact` needs its own decoder. */
export const DECODE_FAMILY_BY_STRATEGY = {clone: 'rj', mutate: 'rj', direct: 'rj', compact: 'cjr'} as const;
/** Reverse of ENCODE_FAMILY_BY_STRATEGY: what strategy an injected encode family tells. */
export const STRATEGY_BY_ENCODE_FAMILY = {pjs: 'clone', pj: 'mutate', sj: 'direct', cj: 'compact'} as const;
export type EncodeFamily = (typeof ENCODE_FAMILY_BY_STRATEGY)[keyof typeof ENCODE_FAMILY_BY_STRATEGY];
export type DecodeFamily = (typeof DECODE_FAMILY_BY_STRATEGY)[keyof typeof DECODE_FAMILY_BY_STRATEGY];

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';
// Type formats are entirely a RunTypes concern — mion owns no format vocabulary of its own
// and re-exports none. Import `typeFormats` / `FormatName` from @mionjs/run-types directly.
