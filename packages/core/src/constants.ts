/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {CoreRouterOptions} from './types/general.types.ts';
import {getFnHash} from '@ts-runtypes/core';

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
 * Per-function cache-key prefixes, DERIVED from @ts-runtypes' `getFnHash` (no hardcoding).
 * Each entry is the `<fnHash>` half of the ts-runtypes runtime cache key `<fnHash>_<typeId>`
 * (see src/runtypes/mionAdapter), keyed by mion's family name and mapped to the
 * ts-runtypes fn key. Since @ts-runtypes 0.9.3 the fnHash salt no longer folds the binary
 * version, so these prefixes are STABLE across releases and `getFnHash` reads them from
 * ts-runtypes' Go-generated table (the single source of truth) — a version bump needs NO
 * refresh here (the `<typeId>` half still carries the version for cache invalidation). The
 * prefixes are TYPE-INDEPENDENT (family + default options only), so one value per family
 * covers every type.
 */
export const JIT_FUNCTION_IDS = {
    isType: getFnHash('val'),
    typeErrors: getFnHash('verr'),
    prepareForJson: getFnHash('pj'),
    restoreFromJson: getFnHash('rj'),
    stringifyJson: getFnHash('sj'),
    hasUnknownKeys: getFnHash('huk'), // strictTypes
    unknownKeyErrors: getFnHash('uke'), // strictTypes
    toBinary: getFnHash('tb'),
    fromBinary: getFnHash('fb'),
} as const;

/** Empty hash used when no params exist or return type is void (no JIT functions generated) */
export const EMPTY_HASH = '';

/** Format name constants — the ts-runtypes format ids (TypeFormat 2nd type argument).
 *  Relocated from the removed @mionjs/type-formats package; consumed by @mionjs/drizzle. */
export const FormatNames = {
    // String formats
    stringFormat: 'stringFormat',
    uuid: 'uuid',
    email: 'email',
    url: 'url',
    domain: 'domain',
    ip: 'ip',
    date: 'date',
    time: 'time',
    dateTime: 'dateTime',
    // Number formats
    numberFormat: 'numberFormat',
    // BigInt formats
    bigintFormat: 'bigintFormat',
} as const;

export type FormatName = (typeof FormatNames)[keyof typeof FormatNames];
