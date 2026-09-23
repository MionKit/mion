/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Routes} from '../types/general.ts';
import type {CallContext} from '../types/context.ts';
import {RpcError, FatalError, MION_ROUTES, StatusCodes} from '@mionjs/core';
import {route, rawMiddleware} from '../lib/handlers.ts';

// mion's own routes, registered by initRouter for every app. Declared at module level rather than
// through the router factory: a marker call site inside the generic `createMionRouter` would carry an
// unresolved type parameter and `initRouter` takes the widened options type, so either way the build
// compiles them against the built-in default parser. So each one PINS that default: without the
// pin the runtime resolves the router-wide `parser`, it disagrees with what the build compiled,
// and the router refuses to start.
const DEFAULT_WIRE = {parser: {params: 'clone', return: 'clone'}} as const;

export const mionErrorsRoutes = {
  /** A route only to reuse the router's (de)serialization: "@thrownErrors" is a response body field holding
   *  every thrown error, none strongly typed, all carried as RpcError<string>. Registering it also stops a
   *  user route taking the same name. */
  [MION_ROUTES.thrownErrors]: route((ctx: CallContext): Record<string, RpcError<string>> => {
    return ctx.request.thrownErrors || {};
  }, DEFAULT_WIRE),
  /** Strongly types the errors an adapter raises rather than a handler: before the router sees the request
   *  (an HTTP server error, a connection issue), or after the route resolved (a body the adapter refused,
   *  which then runs the chain's alwaysRun members). Registering it also stops a user route taking the name. */
  [MION_ROUTES.platformError]: route((_ctx: CallContext): RpcError<string> => {
    // The real platform error rides on the context; this value only gives the route its type
    return new RpcError({
      publicMessage: 'Platform error',
      type: 'platform-error',
    });
  }, DEFAULT_WIRE),
} as const satisfies Routes;

/** The first member of each of mion's two not-found chains. It throws, so the dispatcher skips every later
 *  member that does not declare `alwaysRun`: a failed request never reaches a session loader or an auth step.
 *  Raw middlewares rather than routes: nobody declared this request, so there is no params or return contract
 *  to compile, and the error belongs in the undeclared `@thrownErrors` slot. The batch id is the only
 *  untrusted input and it is never echoed. */
export const notFoundMiddleware = rawMiddleware((): void => {
  throw new FatalError({
    statusCode: StatusCodes.NOT_FOUND,
    publicMessage: `Route not found`,
    type: 'route-not-found',
  });
});

export const batchNotFoundMiddleware = rawMiddleware((): void => {
  throw new FatalError({
    statusCode: StatusCodes.NOT_FOUND,
    type: 'batch-unknown-id',
    publicMessage:
      'Batch id not registered on this server. Batches are compiled by the build; rebuild the client and the server together.',
  });
});
