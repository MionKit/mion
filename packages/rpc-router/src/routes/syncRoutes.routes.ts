/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {BUILD_VERSION_HEADER, FatalError, MION_ROUTES} from '@mionjs/core';
import type {RouteSyncError, RouteSyncErrorData} from '@mionjs/core';
import {middleware} from '../lib/handlers.ts';
import {getRouteExecutable, getRouterOptions} from '../router.ts';
import {getMethodsDataFor, mionInternalRouteIds} from './client.routes.ts';
import type {MiddlewaresCollection} from '../types/publicMethods.ts';
import type {RemoteMethod} from '../types/remoteMethods.ts';
import type {CallContext} from '../types/context.ts';

let serverBuildVersion: string | undefined;

/** Called by initRouter with the version the build injected into `initRoutes`. */
export function setServerBuildVersion(version: string | undefined): void {
  serverBuildVersion = version || undefined;
}

/** Sends the API version header and, under `syncRoutes`, refuses a call whose route sync ids are missing or differ. */
function mionSyncRoutes(ctx: CallContext, routeSyncIds?: string[]): RouteSyncError | void {
  const opts = getRouterOptions();
  // set on the response, not returned: a header return beside the error would make the answer a union
  if (opts.apiVersionCheck && serverBuildVersion) ctx.response.headers.set(BUILD_VERSION_HEADER, serverBuildVersion);
  // a failed chain (not found, a refused body) runs no route, so there is nothing to check
  if (opts.syncRoutes && !ctx.response.hasErrors) return checkRouteSyncIds(ctx, routeSyncIds);
}

function checkRouteSyncIds(ctx: CallContext, routeSyncIds: string[] | undefined): RouteSyncError | void {
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

/** The routes a call runs, in call order; a single call to one of mion's own routes (metadata, errors) is never checked. */
function getCalledRoutes(ctx: CallContext): RemoteMethod[] {
  if (ctx.batchRouteIds) return ctx.batchRouteIds.map((id) => getRouteExecutable(id) as RemoteMethod);
  const {executionChain} = ctx;
  const route = executionChain.methods[executionChain.routeIndex];
  if (!route || mionInternalRouteIds.has(route.id)) return [];
  return [route];
}

export const mionSyncMiddlewares = {
  // Pinned parser on both wires and a fixed share of every chain's body limit, like mion@methodsMetadata.
  [MION_ROUTES.syncRoutes]: middleware(mionSyncRoutes, {
    alwaysRun: true,
    parser: {params: 'clone', return: 'clone'},
    maxBodySize: 1024,
  }),
} as const satisfies MiddlewaresCollection;
