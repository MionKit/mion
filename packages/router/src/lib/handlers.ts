/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  HeadersMiddleFnOptions,
  MiddleFnOptions,
  PlainHeadersMiddleFnOptions,
  PlainMiddleFnOptions,
  PlainRouteOptions,
  RawMiddleFnOptions,
  RouteOptions,
} from '../types/remoteMethods.ts';
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
import {CompTimeArgs, InjectRunTypeId, InjectTypeFnArgs} from '@mionjs/run-types';
import type {
  ParamsDecode,
  ParamsEncode,
  ParamsFromBinary,
  ParamsToBinary,
  ReturnDecode,
  ReturnEncode,
  ReturnFromBinary,
  ReturnToBinary,
} from '../types/encoder.ts';

// ############# Route & MiddleFns initialization (INTERNAL) #############
// These helpers initialize the definition objects AND are the mion injection points: the trailing
// marker params are filled at BUILD TIME by @mionjs/devtools. Not exported from the package,
// consumers reach them as the closures `createMionRouter()` returns; only the internal client /
// error / serializer routes call them directly, and each of those pins its own `encoder`.
//
// ⚠️ The markers must be spelled out (InjectTypeFnArgs<...>) — a local type alias over a marker is
// not recognized by the mion scanner. The fn key vocabulary is MION_FN_KEYS in @mionjs/core; the
// payload is projected by family tag, so order does not matter. The four strategy slots are computed
// from the `encoder` literal (types/encoder.ts), and a slot resolving to `never` is not compiled.
// `opts` is CompTimeArgs so the build rejects a non-literal (CTA001 / CTA004). One call signature per
// helper, mirrored in types/mionRouter.ts with the factory options; a change here needs one there.
// 'fmt' (the sanitizeParams lane) is requested on the PARAMS markers only.

export function route<H extends Handler, const RO extends RouteOptions = PlainRouteOptions>(
  handler: H,
  opts?: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO>,
    ParamsDecode<RO>,
    ParamsToBinary<RO>,
    ParamsFromBinary<RO>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO>,
    ReturnDecode<RO>,
    ReturnToBinary<RO>,
    ReturnFromBinary<RO>
  >,
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

/** `route()` with `isMutation` pinned. Typed `typeof route`, so both keep the marker signature the
 *  scanner reads at the call site without spelling it out twice more. */
function routeWithMutation(isMutation: boolean): typeof route {
  return ((handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
    type: HandlerType.route,
    handler,
    options: {...opts, isMutation},
    rtFns: {paramsFns, returnFns, paramsId, returnId},
  })) as typeof route;
}

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export const query = routeWithMutation(false);

/** Route handler for mutations. Explicit alias for route() with isMutation: true. */
export const mutation = routeWithMutation(true);

export function middleFn<H extends Handler, const RO extends MiddleFnOptions = PlainMiddleFnOptions>(
  handler: H,
  opts?: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO>,
    ParamsDecode<RO>,
    ParamsToBinary<RO>,
    ParamsFromBinary<RO>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO>,
    ReturnDecode<RO>,
    ReturnToBinary<RO>,
    ReturnFromBinary<RO>
  >,
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
export function headersFn<H extends HeaderHandler, const RO extends HeadersMiddleFnOptions = PlainHeadersMiddleFnOptions>(
  handler: H,
  opts?: CompTimeArgs<RO>,
  headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
  paramsFns?: InjectTypeFnArgs<
    HeaderHandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO>,
    ParamsDecode<RO>,
    ParamsToBinary<RO>,
    ParamsFromBinary<RO>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO>,
    ReturnDecode<RO>,
    ReturnToBinary<RO>,
    ReturnFromBinary<RO>
  >,
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
