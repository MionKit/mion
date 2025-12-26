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
    getRemoteMethodsMetadataById: 'mion_GetRemoteMethodsMetadataById',
    /** get remote methods metadata by route path, this include all hooks in the execution path of the route. */
    getRemoteMethodsMetadataByPath: 'mion_GetRemoteMethodsMetadataByPath',
    /** global error route for errors that occur before reaching the router */
    globalError: '@mionkit/globalError',
    /** unexpected error route for errors thrown during route execution that are not part of the return type union */
    unexpectedError: '@mionkit/unexpectedError',
    /** not-found route for when a requested route doesn't exist */
    notFound: '@mionkit/notFound',
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
    /** Any expected error in the application, ie: validation error, not found, etc...
     * These error should be typically handled in each handler, ie, not found will show an empty state.
     */
    APPLICATION_ERROR: 409,
    /**  Any unexpected error in the application, ie: database error, serialization error, etc...
     * These are are typically irrecoverable and can be handled globally, ie redirect to login page if auth fails
     */
    UNEXPECTED_ERROR: 500,
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
    jsonStringify: 'js',
    toJavascript: 'tc',
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
