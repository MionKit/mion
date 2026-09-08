/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {HandlerType} from '@mionjs/core';
import type {HeadersFnHelper, MiddleFnHelper, RawMiddleFnHelper, RouteHelper, RouterOptionsInput} from '../types/mionRouter.ts';

// ############# Route & MiddleFns initialization (INTERNAL) #############
// These bodies initialize the definition objects AND are the mion injection points: the trailing
// marker params are filled at BUILD TIME by @mionjs/devtools. Not exported from the package,
// consumers reach them as the closures `createMionRouter()` returns; only the internal client /
// error / serializer routes call them directly, and each of those pins its own `encoder`.
//
// ⚠️ There is NO signature here on purpose. Each body is TYPED BY its helper interface in
// types/mionRouter.ts, which is the one place a helper signature is written. Re-declaring the
// parameters here would be a second surface to keep in step, which is exactly what this avoids.
// `RouterOptionsInput` is the widest options shape; `createMionRouter` narrows each helper to its
// own `O` so a declaration reads the factory's options.

export const route: RouteHelper<RouterOptionsInput> = (handler, opts, paramsFns, returnFns, paramsId, returnId, isAsyncId) => ({
  type: HandlerType.route,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId},
});

/** `route()` with `isMutation` pinned. Typed as the same helper, so both keep the marker signature
 *  the scanner reads at the call site. */
function routeWithMutation(isMutation: boolean): RouteHelper<RouterOptionsInput> {
  return (handler, opts, paramsFns, returnFns, paramsId, returnId, isAsyncId) => ({
    type: HandlerType.route,
    handler,
    options: {...opts, isMutation},
    rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId},
  });
}

/** Route handler for read-only queries. Uses GET with ?data=base64url on the client when payload fits. */
export const query = routeWithMutation(false);

/** Route handler for mutations. Explicit alias for route() with isMutation: true. */
export const mutation = routeWithMutation(true);

export const middleFn: MiddleFnHelper<RouterOptionsInput> = (handler, opts, paramsFns, returnFns, paramsId, returnId, isAsyncId) => ({
  type: HandlerType.middleFn,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId},
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
  isAsyncId
) => ({
  type: HandlerType.headersMiddleFn,
  handler,
  options: opts,
  rtFns: {paramsFns, returnFns, paramsId, returnId, isAsyncId, headersFns, headersId},
});

export const rawMiddleFn: RawMiddleFnHelper<RouterOptionsInput> = (handler, opts) => ({
  type: HandlerType.rawMiddleFn,
  handler,
  options: opts,
});
