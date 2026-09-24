/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions} from './types/general.types.ts';
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

/** The API version the server was built from. Lives in core so the client reads the name without importing the router. */
export const BUILD_VERSION_HEADER = 'x-build-version';

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
  /** Start middleware that sends the API version header and, under `syncRoutes`, checks each route's sync id */
  syncRoutes: 'mion@syncRoutes',
} as const;

/** Type-only key the build reads the router options under; a symbol so it never widens a route map's string keys. */
export declare const ROUTER_OPTIONS: unique symbol;

/** Kept for HTTP backwards compatibility only: in a mion app the error type, a human readable code, is what matters. */
export const StatusCodes = {
  /** Any error in the server that is not related to the application, ie: server not ready, etc... */
  SERVER_ERROR: 500,
  /** Any expected and strongly typed error returned by a route/middleware. ie: entity not found, etc. */
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
  middleware: 2,
  headersMiddleware: 3,
  rawMiddleware: 4,
} as const;

// A row IS the marker's slot list, named by the MARKER token InjectTypeFnArgs asks for, not the compiled tag.
// Adding a strategy is one row here and one in the Go mirror (resolver/apigen.go).
// The validator follows the decoder: `clone` and `compact` rebuild the declared shape, so only a union can hide a key.

/** The families each strategy compiles, the same row on both wires. */
export const PARSE_MODES = {
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

export type ParseModes = typeof PARSE_MODES;
export type ParseModeRow = ParseModes[keyof ParseModes];

/** Used when no params exist or the return type is void: no JIT functions are generated. */
export const EMPTY_HASH = '';
// mion owns no format vocabulary and re-exports none: import `typeFormats` / `FormatName` from @mionjs/run-types.
