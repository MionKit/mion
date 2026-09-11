/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Routes} from '../types/general.ts';
import type {CallContext} from '../types/context.ts';
import {RpcError, FatalError, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {route} from '../lib/handlers.ts';

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
   * Route that handles not-found scenarios when a requested route doesn't exist.
   * This route is registered as an internal mion route.
   * The route is called by dispatch logic when no matching route is found.
   * Throws an RpcError that will be caught and stored in thrownErrors by the router.
   */
  [MION_ROUTES.notFound]: route((ctx: CallContext): RpcError<'route-not-found'> => {
    // Router errors are undeclared by design: nobody declared this route, so the error
    // belongs in the undeclared slot rather than a typed one.
    // eslint-disable-next-line @mionjs/no-throw-in-handlers -- deliberate, see above
    throw new FatalError({
      statusCode: StatusCodes.NOT_FOUND,
      publicMessage: `Route not found`,
      type: 'route-not-found',
    });
  }, DEFAULT_WIRE),
  /**
   * Route that answers a batch request whose id names no registered batch. Resolved while the
   * context is acquired, so the chain runs like any other not-found: the global middleFns see the
   * request, the body is never read. The id is the only untrusted input and it is never echoed.
   */
  [MION_ROUTES.batchNotFound]: route((ctx: CallContext): RpcError<'batch-unknown-id'> => {
    // eslint-disable-next-line @mionjs/no-throw-in-handlers -- deliberate, a router error, see notFound
    throw new FatalError({
      statusCode: StatusCodes.NOT_FOUND,
      type: 'batch-unknown-id',
      publicMessage:
        'Batch id not registered on this server. Batches are compiled by the build; rebuild the client and the server together.',
    });
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
