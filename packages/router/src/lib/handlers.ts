/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType} from '@mionjs/core';
import type {EmptyOptions, HeadersFnHelper, MiddleFnHelper, RawMiddleFnHelper, RouteHelper} from '../types/mionRouter.ts';

// ############# Route & MiddleFns initialization (INTERNAL) #############
// These helpers initialize route & middleFn definition objects AND are the mion
// injection points. They are NOT exported from the package: consumers reach them as
// the closures `createMionRouter()` returns (src/router.ts), which is what carries the
// router options into every declaration; only the internal client / error / serializer
// routes call them directly, with the built-in strategies (no router options in scope).
//
// Their SIGNATURES live in src/types/mionRouter.ts, once, so the factory and these bodies
// cannot drift: the trailing marker params are filled at BUILD TIME by the @mionjs/devtools
// vite plugin with the precompiled type functions each call site's handler type and
// `serializer` option demand, and the runtime reads that payload by family tag.

export const route: RouteHelper<EmptyOptions> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.route,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId},
});

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export const query: RouteHelper<EmptyOptions> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.route,
  handler,
  options: {...opts, isMutation: false},
  rtFns: {paramsFns, returnFns, paramsId, returnId},
});

/** Route handler for mutations. Explicit alias for route() with isMutation: true. */
export const mutation: RouteHelper<EmptyOptions> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.route,
  handler,
  options: {...opts, isMutation: true},
  rtFns: {paramsFns, returnFns, paramsId, returnId},
});

export const middleFn: MiddleFnHelper<EmptyOptions> = (handler, opts, paramsFns, returnFns, paramsId, returnId) => ({
  type: HandlerType.middleFn,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId},
});

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
export const headersFn: HeadersFnHelper<EmptyOptions> = (
  handler,
  opts,
  headersFns,
  paramsFns,
  returnFns,
  headersId,
  paramsId,
  returnId
) => ({
  type: HandlerType.headersMiddleFn,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, headersFns, headersId},
});

export const rawMiddleFn: RawMiddleFnHelper<EmptyOptions> = (handler, opts) => ({
  type: HandlerType.rawMiddleFn,
  handler,
  options: opts,
});
