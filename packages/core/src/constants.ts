/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions} from './types/general.types';

export const DEFAULT_CORE_OPTIONS: CoreOptions = {
    /** automatically generate and uuid */
    autoGenerateErrorId: false,
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
    /** get remote methods metadata by route path, this include all hooks in the execution path of the route. */
    methodsMetadataByPath: 'mion@methodsMetadataByPath',
    /** Platform or adapters errors that occur before reaching the router or outside the router and are platform/adapter related */
    platformError: 'mion@platformError',
    /** not-found route. This route is called when a requested route doesn't exist */
    notFound: 'mion@notFound',
    /**
     * !IMPORTANT!!
     * This is technically not a route, but a special key used to store unexpected errors in the response body.
     * is declared as a route to reuse existing router serialization/deserialization logic.
     * Errors thrown by routes/hooks, these are not strongly typed
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
    /** Any expected and strongly typed error returned by a route/hook. ie: entity not found, etc. */
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
    hook: 2,
    headerHook: 3,
    rawHook: 4,
} as const;

export const JIT_FUNCTION_IDS = {
    isType: 'is',
    typeErrors: 'te',
    prepareForJson: 'tj',
    restoreFromJson: 'fj',
    stringifyJson: 'sj',
    toJSCode: 'tc',
    toBinary: 'tBi',
    fromBinary: 'fBi',
    format: 'fmt',
    unknownKeyErrors: 'uk',
    hasUnknownKeys: 'hk',
    stripUnknownKeys: 'sk',
    unknownKeysToUndefined: 'ku',
    aux: 'aux',
    mock: 'mock',
    pureFunction: 'pf',
} as const;

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';
