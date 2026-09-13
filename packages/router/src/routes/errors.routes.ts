/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Routes} from '../types/general.ts';
import type {CallContext} from '../types/context.ts';
import {RpcError, FatalError, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {route, rawMiddleFn} from '../lib/handlers.ts';

// mion's own routes, registered by initRouter for every app. They are DECLARED here at module
// level rather than through the router factory, because a marker call site inside the generic
// `createMionRouter` would carry an unresolved type parameter and `initRouter` takes the widened
// options type: either way the build compiles them against the built-in default encoder. So each
// one PINS that default. Without the pin a router-wide `encoder` is the pair the runtime resolves,
// it disagrees with what the build compiled, and the router refuses to start.
const DEFAULT_WIRE = {encoder: {params: 'clone', return: 'clone'}} as const;

export const mionErrorsRoutes = {
  /**
   * !IMPORTANT!
   * This is declared as route mostly to reuse existing router serialization/deserialization functionality.
   * But "@thrownErrors" is expected to be a field in response body that contain all thrown errors from other executables.
   * thrown Errors are not strongly typed and are all serialized/deserialized as RpcError<string>.
   * this also prevents users to register a route with the same name.
   */
  [MION_ROUTES.thrownErrors]: route((ctx: CallContext): Record<string, RpcError<string>> => {
    return ctx.request.thrownErrors || {};
  }, DEFAULT_WIRE),
  /**
   * Platform error route for strongly typing platform/adapter errors.
   * Platform errors occur before reaching the router or outside the router
   * and are platform/adapter related (e.g., HTTP server errors, connection issues).
   * This route is used for serialization/deserialization of platform errors.
   * This also prevents users to register a route with the same name.
   */
  [MION_ROUTES.platformError]: route((_ctx: CallContext): RpcError<string> => {
    // Platform errors are passed through context, this route is for type serialization
    return new RpcError({
      publicMessage: 'Platform error',
      type: 'platform-error',
    });
  }, DEFAULT_WIRE),
} as const satisfies Routes;

/**
 * The first member of each of mion's two not-found chains. It throws, so the dispatcher's own rule
 * skips every later member that does not declare `alwaysRun`: a request that arrived already failed
 * never reaches a session loader or an authorization step.
 *
 * Raw middleFns rather than routes: nobody declared this request, so there is no params or return
 * contract to compile, and the error belongs in the undeclared `@thrownErrors` slot, keyed by the
 * member's own id. The batch id is the only untrusted input and it is never echoed.
 */
export const notFoundMiddleFn = rawMiddleFn((): void => {
  throw new FatalError({
    statusCode: StatusCodes.NOT_FOUND,
    publicMessage: `Route not found`,
    type: 'route-not-found',
  });
});

export const batchNotFoundMiddleFn = rawMiddleFn((): void => {
  throw new FatalError({
    statusCode: StatusCodes.NOT_FOUND,
    type: 'batch-unknown-id',
    publicMessage:
      'Batch id not registered on this server. Batches are compiled by the build; rebuild the client and the server together.',
  });
});
