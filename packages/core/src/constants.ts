/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions, SerializerStrategy} from './types/general.types.ts';

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

/** The `<fnHash>` half of the runtime cache key `<fnHash>_<typeId>`, one per family: TYPE-INDEPENDENT and release-stable.
 *  Written out rather than derived, since `getFnHash` shipped the whole Go hash table to every browser.
 *  constants.jitFunctionIds.spec.ts fails if a value drifts from `getFnHash`. */
export const JIT_FUNCTION_IDS = {
  isType: 'Eq2V',
  typeErrors: 'swxg',
  hasUnknownKeys: 'GsPX', // strictTypes
  unknownKeyErrors: 'r8yS', // strictTypes
  formatTransform: 'mzca', // sanitizeParams
  // the JSON families, one encoder and one decoder per strategy (see ENCODE_FAMILY_BY_STRATEGY)
  prepareForJsonClone: 'A0Qb',
  prepareForJsonMutate: 'AwYs',
  compactForJson: 'rpEK',
  restoreFromJsonMutate: 'w8ie',
  restoreFromJsonClone: 'Ky89',
  compactFromJson: 'FFsn',
} as const satisfies Record<string, string>;

/** Named by the MARKER token a route's InjectTypeFnArgs asks for, not the short tag the compiled entry carries. */
export const ENCODE_FAMILY_BY_STRATEGY = {
  clone: 'prepareForJsonClone',
  mutate: 'prepareForJsonMutate',
  compact: 'compactForJson',
} as const;
/** One decoder per SIDE: the server decodes params from any caller, so it rebuilds the declared shape.
 *  The client decodes a return its own server wrote, and never hands on an undeclared key. */
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

/** Used when no params exist or the return type is void: no JIT functions are generated. */
export const EMPTY_HASH = '';
// mion owns no format vocabulary and re-exports none: import `typeFormats` / `FormatName` from @mionjs/run-types.
