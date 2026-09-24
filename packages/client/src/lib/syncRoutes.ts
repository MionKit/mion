/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Under the server's `syncRoutes` every call carries one sync id per route, computed from the rows this client
// holds. Kept out of the fetched lane: a bundled client sends ids without ever loading it.

import {MION_ROUTES, RpcError, isRpcError, routeSyncId} from '@mionjs/core';
import type {InjectRouterOptions} from '@mionjs/run-types';
import type {RouteSyncErrorData} from '@mionjs/router';
import type {SubRequest} from '../types.ts';
import {getMethod} from './methods.ts';

export type RouteSyncRefusal = RpcError<'route-types-mismatch' | 'route-sync-required', RouteSyncErrorData>;

/** The servers (baseURLs) that check route sync ids: told by the build, or learned from a refusal. */
const syncServers = new Set<string>();

/** Called by `initClient` with what the build read off the API type. */
export function setInjectedRouterOptions(baseURL: string, routerOptions: InjectRouterOptions<unknown> | undefined): void {
  if (routerOptions?.syncRoutes === true) syncServers.add(baseURL);
}

export function sendsSyncIds(baseURL: string): boolean {
  return syncServers.has(baseURL);
}

export function learnSyncRoutes(baseURL: string): void {
  syncServers.add(baseURL);
}

/** Tests only. */
export function resetSyncRoutes(): void {
  syncServers.clear();
}

/** One id per route in call order; '' where a row is missing, which the server answers with the rows. */
export function routeSyncIds(routeIds: string[]): string[] {
  return routeIds.map((id) => {
    const row = getMethod(id);
    return (row && routeSyncId(row, getMethod)) || '';
  });
}

export function createSyncSubRequest(routeIds: string[]): SubRequest<any> {
  return {
    pointer: [MION_ROUTES.syncRoutes],
    id: MION_ROUTES.syncRoutes,
    isResolved: false,
    params: [routeSyncIds(routeIds)],
  } as SubRequest<any>;
}

/** The middleware declares a union, so its answer arrives as an `[index, value]` envelope. */
export function syncRefusalOf(slot: unknown): RouteSyncRefusal | undefined {
  const value = Array.isArray(slot) ? slot[1] : slot;
  return isRpcError(value) ? (new RpcError(value as RouteSyncRefusal) as RouteSyncRefusal) : undefined;
}
