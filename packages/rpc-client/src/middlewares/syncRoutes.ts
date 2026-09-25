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
  middleware.onRequest((call, context) => call(routeSyncIds(context)));

  // no route ran, so a resend is always allowed
  middleware.onError('route-sync-required', async (refusal, context) => {
    const rows = refusal.errorData?.metadata;
    if (rows?.methods) (await loadMetadataFromServer()).installMethodRows(rows, context.options, Object.keys(rows.methods));
    if (!context.retry()) throw refusal;
  });

  // a fetched row is a cache of the server's and can be relearned; a bundled one needs a new build
  middleware.onError('route-types-mismatch', async (refusal, context) => {
    const refusedIds = refusal.errorData?.routeIds;
    if (!refusedIds?.length || refusedIds.some((id) => isBundledMethod(id))) throw refusal;
    const lane = await loadMetadataFromServer();
    await lane.forgetFetchedMetadata(refusedIds, context.options);
    // fetched here rather than on a second refusal: a call gets one resend per middleware
    await lane.fetchRemoteMethodsMetadata(refusedIds, context.options, context.signal);
    if (!context.retry()) throw refusal;
  });
}

/** One id per called route, in the server's batch order; the server answers an '' id with the rows. */
function routeSyncIds(context: CallContext): string[] {
  const routes = context.batchSubRequests?.length ? context.batchSubRequests : context.route ? [context.route] : [];
  return routes.map((route) => getMethod(route.id)?.syncId ?? '');
}
