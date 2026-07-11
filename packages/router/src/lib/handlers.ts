/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from '../types/remoteMethods.ts';
import {HandlerType} from '@mionjs/core';
import {Handler, HandlerParams, HandlerReturn, HeaderHandler, RawMiddleFnHandler} from '../types/handlers.ts';
import {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from '../types/definitions.ts';
import {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

// ############# Route & MiddleFns initialization #############
// These helpers initialize route & middleFn definition objects AND are the ts-runtypes
// injection points: the trailing marker params are filled at BUILD TIME by the
// @ts-runtypes/devtools vite plugin (wrapped by @mionjs/devtools mionVitePlugin) with
// precompiled type functions for each call site's handler type.
//
// ⚠️ The markers must be spelled out (InjectTypeFnArgs<...>) — a local type alias over a
// marker is not recognized by the ts-runtypes scanner. Fn keys must match MION_FN_KEYS
// in @mionjs/run-types (val, verr, pj, rj, sj).

export function route<H extends Handler>(
    handler: H,
    opts?: RouteOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: opts,
        rtFns: {paramsFns, returnFns, paramsId, returnId},
    };
}

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export function query<H extends Handler>(
    handler: H,
    opts?: RouteOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: {...opts, isMutation: false},
        rtFns: {paramsFns, returnFns, paramsId, returnId},
    };
}

/** Route handler for mutations. Explicit alias for route() with isMutation: true. */
export function mutation<H extends Handler>(
    handler: H,
    opts?: RouteOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H> {
    return {
        type: HandlerType.route,
        handler,
        options: {...opts, isMutation: true},
        rtFns: {paramsFns, returnFns, paramsId, returnId},
    };
}

export function middleFn<H extends Handler>(
    handler: H,
    opts?: MiddleFnOptions,
    paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj'>,
    paramsId?: InjectRunTypeId<HandlerParams<H>>,
    returnId?: InjectRunTypeId<HandlerReturn<H>>
): MiddleFnDef<H> {
    return {
        type: HandlerType.middleFn,
        handler,
        options: opts,
        rtFns: {paramsFns, returnFns, paramsId, returnId},
    };
}

/**
 * MiddleFn for handling HTTP header parameters
 * Used to define middleFns that receive values from HTTP headers
 *
 * ⚠️ ts-runtypes migration: headersFn is NOT migrated yet (header-name extraction from
 * HeadersSubset type args pending); registering one throws at router initialization.
 *
 * @example
 * ```ts
 * headersFn(['authorization'], (ctx, token: string): void => {
 *   // token contains the value of the 'authorization' header
 * })
 * ```
 */
export function headersFn<H extends HeaderHandler>(handler: H, opts?: HeadersMiddleFnOptions): HeadersMiddleFnDef<H> {
    return {
        type: HandlerType.headersMiddleFn,
        handler,
        options: opts,
    };
}

export function rawMiddleFn<H extends RawMiddleFnHandler>(handler: H, opts?: RawMiddleFnOptions): RawMiddleFnDef<H> {
    return {
        type: HandlerType.rawMiddleFn,
        handler,
        options: opts,
    };
}
