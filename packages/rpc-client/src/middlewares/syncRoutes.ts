/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {SyncRoutesHandler} from '@mionjs/core';
import type {CallContext, ClientMiddlewareOf} from '../types.ts';
import {getMethod, isBundledMethod} from '../lib/methods.ts';
import {loadMetadataFromServer} from '../lib/metadataFromServerLoader.ts';

/** Client half of `mionSyncRoutes`: sends each route's sync id, and resends once when the server asks for it. */
export function useSyncRoutes(middleware: ClientMiddlewareOf<SyncRoutesHandler>): void {
  middleware.onRequest((call, context) => call(routeSyncIds(calledRouteIds(context))));

  // no route ran, so a resend is always allowed
  middleware.onError('route-sync-required', async (refusal, context) => {
    const rows = refusal.errorData?.metadata;
    if (rows?.methods) (await loadMetadataFromServer()).installMethodRows(rows, context.options, Object.keys(rows.methods));
    if (!context.retry()) throw refusal;
  });

  // a fetched row is a cache of the server's and can be relearned; a bundled one needs a new build
  middleware.onError('route-types-mismatch', async (refusal, context) => {
    const refusedIds = refusal.errorData?.routeIds ?? calledRouteIds(context);
    if (refusedIds.some((id) => isBundledMethod(id))) throw refusal;
    const lane = await loadMetadataFromServer();
    await lane.forgetFetchedMetadata(refusedIds, context.options);
    // fetched here rather than on a second refusal: a call gets one resend per middleware
    await lane.fetchRemoteMethodsMetadata(refusedIds, context.options, context.signal);
    if (!context.retry()) throw refusal;
  });
}

/** The server answers an '' id with the rows. */
export function routeSyncIds(routeIds: string[]): string[] {
  return routeIds.map((id) => getMethod(id)?.syncId ?? '');
}

/** Same order as the server's batch. */
function calledRouteIds(context: CallContext): string[] {
  if (context.batchSubRequests?.length) return context.batchSubRequests.map((subRequest) => subRequest.id);
  return context.route ? [context.route.id] : [];
}
