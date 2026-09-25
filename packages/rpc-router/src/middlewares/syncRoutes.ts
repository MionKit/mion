/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FatalError} from '@mionjs/core';
import type {RouteSyncError, RouteSyncErrorData, SyncRoutesHandler} from '@mionjs/core';
import {middleware} from '../lib/handlers.ts';
import {getRouteExecutable} from '../router.ts';
import {getMethodsDataFor} from '../routes/client.routes.ts';
import type {RemoteMethod} from '../types/remoteMethods.ts';
import type {CallContext} from '../types/context.ts';

/** Refuses a call whose route sync ids are missing or differ, before any route runs. */
function syncRoutes(ctx: CallContext, routeSyncIds?: string[]): RouteSyncError | void {
  const routes = getCalledRoutes(ctx);
  const mismatched: string[] = [];
  let missing = false;
  for (let i = 0; i < routes.length; i++) {
    const sent = routeSyncIds?.[i];
    if (!sent) missing = true;
    else if (sent !== routes[i].syncId) mismatched.push(routes[i].id);
  }
  if (mismatched.length) {
    return new FatalError<'route-types-mismatch', RouteSyncErrorData>({
      type: 'route-types-mismatch',
      publicMessage:
        `The types of ${mismatched.map((id) => `"${id}"`).join(', ')} changed on the server since this client was built. ` +
        `Reload the app or rebuild the client against the current API.`,
      errorData: {routeIds: mismatched},
    });
  }
  if (missing) {
    return new FatalError<'route-sync-required', RouteSyncErrorData>({
      type: 'route-sync-required',
      publicMessage: 'This server checks each route before running it: send the route sync ids along with the call.',
      errorData: {metadata: getMethodsDataFor(routes.map((route) => route.id))},
    });
  }
}

/** The routes a call runs, in call order. */
function getCalledRoutes(ctx: CallContext): RemoteMethod[] {
  if (ctx.batchRouteIds) return ctx.batchRouteIds.map((id) => getRouteExecutable(id) as RemoteMethod);
  const {executionChain} = ctx;
  const route = executionChain.methods[executionChain.routeIndex];
  return route ? [route] : [];
}

// Placed first in the routes (any key) so a refused call runs nothing else. A pinned parser, since the router-wide
// one never reaches this helper at build time, and a fixed body share so chain limits stay type-derived.
export const mionSyncRoutes = middleware(syncRoutes satisfies SyncRoutesHandler, {
  parser: {params: 'clone', return: 'clone'},
  maxBodySize: 1024,
});
