/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType} from '@mionjs/core';
import type {
  HeadersFnHelper,
  MiddlewareHelper,
  PinnedMutation,
  RawMiddlewareHelper,
  RouteHelper,
  RouterOptionsInput,
} from '../types/mionRouter.ts';

// ############# Route & Middlewares initialization (INTERNAL) #############
// These bodies initialize the definition objects AND are the mion injection points: the trailing marker
// params are filled at BUILD TIME by @mionjs/devtools. Not exported from the package, consumers reach
// them as the closures `createMionRouter()` returns; only the internal client / error / serializer routes
// call them directly, each pinning its own `encoder`.
// ⚠️ There is NO signature here on purpose: each body is TYPED BY its helper interface in
// types/mionRouter.ts, the one place a helper signature is written, so there is no second surface to keep
// in step. `RouterOptionsInput` is the widest options shape; `createMionRouter` narrows each helper to
// its own `O` so a declaration reads the factory's options.

export const route: RouteHelper<RouterOptionsInput> = (
  handler,
  opts,
  paramsFns,
  returnFns,
  paramsId,
  returnId,
  isAsyncId,
  syncId
) => ({
  type: HandlerType.route,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId, syncId},
});

/** Typed as the same helper as `route()`, so both keep the marker signature the scanner reads at the call site. */
function routeWithMutation<M extends boolean>(isMutation: M): RouteHelper<RouterOptionsInput, M> {
  return (handler, opts, paramsFns, returnFns, paramsId, returnId, isAsyncId, syncId) => ({
    type: HandlerType.route,
    handler,
    options: {...opts, isMutation} as PinnedMutation<typeof opts & object, M>,
    rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId, syncId},
  });
}

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export const query = routeWithMutation(false);

export const mutation = routeWithMutation(true);

export const middleware: MiddlewareHelper<RouterOptionsInput> = (
  handler,
  opts,
  paramsFns,
  returnFns,
  paramsId,
  returnId,
  isAsyncId,
  syncId
) => ({
  type: HandlerType.middleware,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId, syncId},
});

export const headersFn: HeadersFnHelper<RouterOptionsInput> = (
  handler,
  opts,
  headersFns,
  paramsFns,
  returnFns,
  headersId,
  paramsId,
  returnId,
  isAsyncId,
  syncId
) => ({
  type: HandlerType.headersMiddleware,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId, syncId, headersFns, headersId},
});

export const rawMiddleware: RawMiddlewareHelper<RouterOptionsInput> = (handler, opts) => ({
  type: HandlerType.rawMiddleware,
  handler,
  options: opts,
});
