/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
  HeadersMiddleFnOptions,
  HeadersMiddleFnOptionsWithEncoder,
  MiddleFnOptions,
  MiddleFnOptionsWithEncoder,
  PlainHeadersMiddleFnOptions,
  PlainMiddleFnOptions,
  PlainRouteOptions,
  RawMiddleFnOptions,
  RouteOptions,
  RouteOptionsWithEncoder,
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
  NoEncoderOptions,
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
// marker is not recognized by the mion scanner. The fn key VOCABULARY is MION_FN_KEYS in
// @mionjs/core; the payload is projected by family tag, so order does not matter. The four
// strategy slots (encode / decode / toBinary / fromBinary) are COMPUTED from the `encoder`
// literal of the route options (types/encoder.ts): a slot that resolves to `never` is not
// compiled. `opts` is CompTimeArgs so the build rejects a non-literal (CTA001 / CTA004).
// Every helper is TWO overloads (see types/mionRouter.ts): without `encoder` on the route the slots
// come from the router-wide default, computed once; with a literal they are computed per call.
// These direct helpers have NO router-wide default (NoEncoderOptions): the factory's typed
// helpers in types/mionRouter.ts carry the options type instead.
// The 'fmt' (formatTransform, the sanitizeParams lane) is requested on the PARAMS
// markers only: a return value is never sanitized.

export function route<H extends Handler>(
  handler: H,
  opts?: CompTimeArgs<PlainRouteOptions>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<NoEncoderOptions, NoEncoderOptions>,
    ParamsDecode<NoEncoderOptions, NoEncoderOptions>,
    ParamsToBinary<NoEncoderOptions, NoEncoderOptions>,
    ParamsFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<NoEncoderOptions, NoEncoderOptions>,
    ReturnDecode<NoEncoderOptions, NoEncoderOptions>,
    ReturnToBinary<NoEncoderOptions, NoEncoderOptions>,
    ReturnFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function route<H extends Handler, const RO extends RouteOptionsWithEncoder>(
  handler: H,
  opts: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO, NoEncoderOptions>,
    ParamsDecode<RO, NoEncoderOptions>,
    ParamsToBinary<RO, NoEncoderOptions>,
    ParamsFromBinary<RO, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO, NoEncoderOptions>,
    ReturnDecode<RO, NoEncoderOptions>,
    ReturnToBinary<RO, NoEncoderOptions>,
    ReturnFromBinary<RO, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function route<H extends Handler>(
  handler: H,
  opts?: unknown,
  paramsFns?: unknown,
  returnFns?: unknown,
  paramsId?: unknown,
  returnId?: unknown
): RouteDef<H> {
  return {
    type: HandlerType.route,
    handler,
    options: opts as RouteOptions | undefined,
    rtFns: {paramsFns, returnFns, paramsId, returnId},
  } as never;
}

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export function query<H extends Handler>(
  handler: H,
  opts?: CompTimeArgs<PlainRouteOptions>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<NoEncoderOptions, NoEncoderOptions>,
    ParamsDecode<NoEncoderOptions, NoEncoderOptions>,
    ParamsToBinary<NoEncoderOptions, NoEncoderOptions>,
    ParamsFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<NoEncoderOptions, NoEncoderOptions>,
    ReturnDecode<NoEncoderOptions, NoEncoderOptions>,
    ReturnToBinary<NoEncoderOptions, NoEncoderOptions>,
    ReturnFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function query<H extends Handler, const RO extends RouteOptionsWithEncoder>(
  handler: H,
  opts: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO, NoEncoderOptions>,
    ParamsDecode<RO, NoEncoderOptions>,
    ParamsToBinary<RO, NoEncoderOptions>,
    ParamsFromBinary<RO, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO, NoEncoderOptions>,
    ReturnDecode<RO, NoEncoderOptions>,
    ReturnToBinary<RO, NoEncoderOptions>,
    ReturnFromBinary<RO, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function query<H extends Handler>(
  handler: H,
  opts?: unknown,
  paramsFns?: unknown,
  returnFns?: unknown,
  paramsId?: unknown,
  returnId?: unknown
): RouteDef<H> {
  return {
    type: HandlerType.route,
    handler,
    options: {...(opts as RouteOptions | undefined), isMutation: false},
    rtFns: {paramsFns, returnFns, paramsId, returnId},
  } as never;
}

/** Route handler for mutations. Explicit alias for route() with isMutation: true. */
export function mutation<H extends Handler>(
  handler: H,
  opts?: CompTimeArgs<PlainRouteOptions>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<NoEncoderOptions, NoEncoderOptions>,
    ParamsDecode<NoEncoderOptions, NoEncoderOptions>,
    ParamsToBinary<NoEncoderOptions, NoEncoderOptions>,
    ParamsFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<NoEncoderOptions, NoEncoderOptions>,
    ReturnDecode<NoEncoderOptions, NoEncoderOptions>,
    ReturnToBinary<NoEncoderOptions, NoEncoderOptions>,
    ReturnFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function mutation<H extends Handler, const RO extends RouteOptionsWithEncoder>(
  handler: H,
  opts: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO, NoEncoderOptions>,
    ParamsDecode<RO, NoEncoderOptions>,
    ParamsToBinary<RO, NoEncoderOptions>,
    ParamsFromBinary<RO, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO, NoEncoderOptions>,
    ReturnDecode<RO, NoEncoderOptions>,
    ReturnToBinary<RO, NoEncoderOptions>,
    ReturnFromBinary<RO, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): RouteDef<H>;
export function mutation<H extends Handler>(
  handler: H,
  opts?: unknown,
  paramsFns?: unknown,
  returnFns?: unknown,
  paramsId?: unknown,
  returnId?: unknown
): RouteDef<H> {
  return {
    type: HandlerType.route,
    handler,
    options: {...(opts as RouteOptions | undefined), isMutation: true},
    rtFns: {paramsFns, returnFns, paramsId, returnId},
  } as never;
}

export function middleFn<H extends Handler>(
  handler: H,
  opts?: CompTimeArgs<PlainMiddleFnOptions>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<NoEncoderOptions, NoEncoderOptions>,
    ParamsDecode<NoEncoderOptions, NoEncoderOptions>,
    ParamsToBinary<NoEncoderOptions, NoEncoderOptions>,
    ParamsFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<NoEncoderOptions, NoEncoderOptions>,
    ReturnDecode<NoEncoderOptions, NoEncoderOptions>,
    ReturnToBinary<NoEncoderOptions, NoEncoderOptions>,
    ReturnFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): MiddleFnDef<H>;
export function middleFn<H extends Handler, const RO extends MiddleFnOptionsWithEncoder>(
  handler: H,
  opts: CompTimeArgs<RO>,
  paramsFns?: InjectTypeFnArgs<
    HandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO, NoEncoderOptions>,
    ParamsDecode<RO, NoEncoderOptions>,
    ParamsToBinary<RO, NoEncoderOptions>,
    ParamsFromBinary<RO, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO, NoEncoderOptions>,
    ReturnDecode<RO, NoEncoderOptions>,
    ReturnToBinary<RO, NoEncoderOptions>,
    ReturnFromBinary<RO, NoEncoderOptions>
  >,
  paramsId?: InjectRunTypeId<HandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): MiddleFnDef<H>;
export function middleFn<H extends Handler>(
  handler: H,
  opts?: unknown,
  paramsFns?: unknown,
  returnFns?: unknown,
  paramsId?: unknown,
  returnId?: unknown
): MiddleFnDef<H> {
  return {
    type: HandlerType.middleFn,
    handler,
    options: opts as MiddleFnOptions | undefined,
    rtFns: {paramsFns, returnFns, paramsId, returnId},
  } as never;
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
  opts?: CompTimeArgs<PlainHeadersMiddleFnOptions>,
  headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
  paramsFns?: InjectTypeFnArgs<
    HeaderHandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<NoEncoderOptions, NoEncoderOptions>,
    ParamsDecode<NoEncoderOptions, NoEncoderOptions>,
    ParamsToBinary<NoEncoderOptions, NoEncoderOptions>,
    ParamsFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<NoEncoderOptions, NoEncoderOptions>,
    ReturnDecode<NoEncoderOptions, NoEncoderOptions>,
    ReturnToBinary<NoEncoderOptions, NoEncoderOptions>,
    ReturnFromBinary<NoEncoderOptions, NoEncoderOptions>
  >,
  headersId?: InjectRunTypeId<HeaderHandlerHeaders<H>>,
  paramsId?: InjectRunTypeId<HeaderHandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): HeadersMiddleFnDef<H>;
export function headersFn<H extends HeaderHandler, const RO extends HeadersMiddleFnOptionsWithEncoder>(
  handler: H,
  opts: CompTimeArgs<RO>,
  headersFns?: InjectTypeFnArgs<HeaderHandlerHeaders<H>, 'val', 'verr'>,
  paramsFns?: InjectTypeFnArgs<
    HeaderHandlerParams<H>,
    'val',
    'verr',
    'huk',
    'uke',
    'fmt',
    ParamsEncode<RO, NoEncoderOptions>,
    ParamsDecode<RO, NoEncoderOptions>,
    ParamsToBinary<RO, NoEncoderOptions>,
    ParamsFromBinary<RO, NoEncoderOptions>
  >,
  returnFns?: InjectTypeFnArgs<
    HandlerReturn<H>,
    'val',
    'verr',
    'huk',
    'uke',
    ReturnEncode<RO, NoEncoderOptions>,
    ReturnDecode<RO, NoEncoderOptions>,
    ReturnToBinary<RO, NoEncoderOptions>,
    ReturnFromBinary<RO, NoEncoderOptions>
  >,
  headersId?: InjectRunTypeId<HeaderHandlerHeaders<H>>,
  paramsId?: InjectRunTypeId<HeaderHandlerParams<H>>,
  returnId?: InjectRunTypeId<HandlerReturn<H>>
): HeadersMiddleFnDef<H>;
export function headersFn<H extends HeaderHandler>(
  handler: H,
  opts?: unknown,
  headersFns?: unknown,
  paramsFns?: unknown,
  returnFns?: unknown,
  headersId?: unknown,
  paramsId?: unknown,
  returnId?: unknown
): HeadersMiddleFnDef<H> {
  return {
    type: HandlerType.headersMiddleFn,
    handler,
    options: opts as HeadersMiddleFnOptions | undefined,
    rtFns: {paramsFns, returnFns, paramsId, returnId, headersFns, headersId},
  } as never;
}

export function rawMiddleFn<H extends RawMiddleFnHandler>(handler: H, opts?: RawMiddleFnOptions): RawMiddleFnDef<H> {
  return {
    type: HandlerType.rawMiddleFn,
    handler,
    options: opts,
  };
}
