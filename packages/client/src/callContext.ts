/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MION_BATCH_KEY, getRoutePath} from '@mionjs/core';
import type {ClientCallContext, ClientOptions, RouteSubRequest, SubRequest} from './types.ts';

/** `batchId` is build-injected and only ends up in the batch path */
export function createCallContext(
  options: ClientOptions,
  route?: RouteSubRequest<any>,
  batchSubRequests?: RouteSubRequest<any>[],
  batchId?: string,
  signal?: AbortSignal
): ClientCallContext {
  const isBatch = !!batchSubRequests && batchSubRequests.length > 0;
  const context: ClientCallContext = {
    path: isBatch
      ? `${getRoutePath([MION_BATCH_KEY], options)}?id=${encodeURIComponent(batchId ?? '')}`
      : route
        ? getRoutePath(route.pointer, options)
        : 'no-route',
    requestId: isBatch ? MION_BATCH_KEY : route ? route.id : 'no-route',
    route,
    batchSubRequests,
    subRequestList: {},
    options,
    signal,
    response: undefined,
    thrownErrorIds: new Set<string>(),
  };
  if (isBatch) batchSubRequests.forEach((subRequest) => addSubRequest(context, subRequest));
  else if (route) addSubRequest(context, route);
  return context;
}

export function addSubRequest(context: ClientCallContext, subRequest: SubRequest<any>): void {
  if (subRequest.isResolved) throw new Error(`SubRequest ${subRequest.id} is already resolved`);
  context.subRequestList[subRequest.id] = subRequest;
}

export function getRouteIds(context: ClientCallContext): string[] {
  if (context.batchSubRequests && context.batchSubRequests.length > 0) return context.batchSubRequests.map((sr) => sr.id);
  return [context.requestId];
}

/** Same order as getRouteIds() */
export function getRoutePointers(context: ClientCallContext): string[][] {
  if (context.batchSubRequests && context.batchSubRequests.length > 0) return context.batchSubRequests.map((sr) => sr.pointer);
  return context.route ? [context.route.pointer] : [];
}
