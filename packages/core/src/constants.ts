/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions} from './types/general.types.ts';

export const DEFAULT_CORE_OPTIONS: CoreRouterOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: false,
    basePath: '',
    suffix: '',
};

export const PATH_SEPARATOR = '/';
export const ROUTE_PATH_ROOT = PATH_SEPARATOR;
export const ROUTER_ITEM_SEPARATOR_CHAR = '/';
export const MAX_UNKNOWN_KEYS = 10;
export const MAX_STACK_DEPTH = 50;

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
 * Per-function cache-key prefixes. Since the ts-runtypes migration these are the
 * ts-runtypes per-family fn hashes (3-char, stable per family + default options + binary
 * version), so `<prefix>_<typeId>` matches the ts-runtypes runtime fn cache keys exactly
 * (see @mionjs/run-types mionAdapter). Pinned to @ts-runtypes 0.9.1 EXACTLY (0.9.0 already hashed differently) and verified by the
 * run-types adapter spec — a ts-runtypes version bump that re-hashes families will fail
 * that spec loudly.
 */
export const JIT_FUNCTION_IDS = {
    isType: 'dzd', // ts-runtypes 'val'
    typeErrors: 'nnv', // ts-runtypes 'verr'
    prepareForJson: 'Hrx', // ts-runtypes 'pj'
    restoreFromJson: 'hxf', // ts-runtypes 'rj'
    stringifyJson: 'wS2', // ts-runtypes 'sj'
    hasUnknownKeys: 'Dtr', // ts-runtypes 'huk' (strictTypes)
    unknownKeyErrors: 'dRv', // ts-runtypes 'uke' (strictTypes)
    toBinary: 'fjF', // ts-runtypes 'tb'
    fromBinary: 'ocw', // ts-runtypes 'fb'
} as const;

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';
