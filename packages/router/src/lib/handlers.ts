/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HeadersMiddleFnOptions, MiddleFnOptions, RawMiddleFnOptions, RouteOptions} from '../types/remoteMethods.ts';
import {HandlerType} from '@mionjs/core';
import {
  Handler,
  HandlerParams,
  HandlerReturn,
  HeaderHandler,
  HeaderHandlerHeaders,
  HeaderHandlerParams,
  RawMiddleFnHandler,
} from '../types/handlers.ts';
import {HeadersMiddleFnDef, MiddleFnDef, RawMiddleFnDef, RouteDef} from '../types/definitions.ts';
import {InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';

// ############# Route & MiddleFns initialization (INTERNAL) #############
// These helpers initialize route & middleFn definition objects AND are the mion
// injection points. They are NOT exported from the package: consumers reach them as
// the closures `createMionRouter()` returns (src/router.ts, typed in src/types/mionRouter.ts),
// which is what carries the router options into every declaration; only the internal
// client / error / serializer routes call them directly.
// The trailing marker params are filled at BUILD TIME by the
// @mionjs/devtools vite plugin (wrapped by @mionjs/devtools mionVitePlugin) with
// precompiled type functions for each call site's handler type.
//
// ⚠️ The markers must be spelled out (InjectTypeFnArgs<...>) — a local type alias over a
// marker is not recognized by the mion scanner. The fn keys and their ORDER are
// defined by MION_FN_KEYS in @mionjs/core, which drives the payload projection; do not
// restate the list here (it drifted last time) — change it there and mirror it below.
// The trailing 'fmt' (formatTransform, the sanitizeParams lane) is requested on the PARAMS
// markers only: a return value is never sanitized, so the return payload stops at 'fb'.

export function route<H extends Handler>(
  handler: H,
  opts?: RouteOptions,
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
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
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
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
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
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
  paramsFns?: InjectTypeFnArgs<HandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
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
 * Used to define middleFns that receive values from HTTP headers.
 * The handler's 2nd param must be a HeadersSubset<Required, Optional>; the required/optional
 * header names are extracted at build time from its runtype graph. A HeadersSubset return
 * gets its headers written onto the response.
 *
 * @example
 * ```ts
 * headersFn((ctx, h: HeadersSubset<'authorization'>): void => {
 *   // h.headers.authorization contains the value of the 'authorization' header
 * })
 * ```
 */
export function headersFn<H extends HeaderHandler>(
  handler: H,
  opts?: HeadersMiddleFnOptions,
  headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
  paramsFns?: InjectTypeFnArgs<HeaderHandlerParams<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb', 'fmt'>,
  returnFns?: InjectTypeFnArgs<HandlerReturn<H>, 'val', 'verr', 'pj', 'rj', 'sj', 'huk', 'uke', 'tb', 'fb'>,
  headersId?: InjectRunTypeId<HeaderHandlerHeaders<H>>,
  paramsId?: InjectRunTypeId<HeaderHandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): HeadersMiddleFnDef<H> {
  return {
    type: HandlerType.headersMiddleFn,
    handler,
    options: opts,
    rtFns: {paramsFns, returnFns, paramsId, returnId, headersFns, headersId},
  };
}

export function rawMiddleFn<H extends RawMiddleFnHandler>(handler: H, opts?: RawMiddleFnOptions): RawMiddleFnDef<H> {
  return {
    type: HandlerType.rawMiddleFn,
    handler,
    options: opts,
  };
}
