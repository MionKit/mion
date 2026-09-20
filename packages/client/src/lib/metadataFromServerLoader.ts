/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {ClientOptions} from '../types.ts';

// Reaches the fetched lane on demand through `#metadata-from-server`, a package.json `imports` entry of
// @mionjs/client so no consumer alias can collide with it; @mionjs/devtools answers it with an
// empty stub under `bundleApi: 'bundled'`, which is what keeps the lane out of that build.

type MetadataFromServer = typeof import('./metadataFromServer.ts');

/** What the request and response paths ask of the lane WITHOUT loading it. */
export interface MetadataCacheHooks {
  extractAndProcessMetadata(routeKey: string, parsedBody: any, options: ClientOptions): void;
  takeMetadataCacheError(): RpcError<string> | undefined;
  wasHydratedFromCache(id: string, options: ClientOptions): boolean;
  purgeHydratedMetadata(ids: string[], options: ClientOptions): Promise<void>;
}

let laneModule: MetadataFromServer | undefined;
let loading: Promise<MetadataFromServer> | undefined;
let cacheHooks: MetadataCacheHooks | undefined;

/** Loads the lane once per process. Callers await it inside the request path's own try, so a failed
 *  load becomes that call's undeclared slot; the failure is forgotten so a later call retries. */
export function loadMetadataFromServer(): Promise<MetadataFromServer> {
  if (laneModule) return Promise.resolve(laneModule);
  loading ??= (import('#metadata-from-server') as Promise<MetadataFromServer>)
    .then((loaded) => {
      laneModule = loaded;
      return loaded;
    })
    .catch((error) => {
      loading = undefined;
      throw laneLoadError(error);
    });
  return loading;
}

/** The cache half if present, never loading it; undefined means nothing was ever fetched or stored. */
export function metadataCacheHooks(): MetadataCacheHooks | undefined {
  return cacheHooks;
}

/** Called by the cache module as it evaluates, whether through `loadMetadataFromServer` or a direct import. */
export function registerMetadataCacheHooks(hooks: MetadataCacheHooks): void {
  cacheHooks = hooks;
}

/** True when a call has reached the lane. Tests only. */
export function isMetadataFromServerLoaded(): boolean {
  return laneModule !== undefined;
}

/** Forgets the loaded lane. Tests only: simulates a process that never reached it. */
export function resetMetadataFromServer(): void {
  laneModule = undefined;
  loading = undefined;
}

function laneLoadError(error: unknown): RpcError<'metadata-load-error'> {
  return new RpcError({
    type: 'metadata-load-error',
    publicMessage:
      'Could not load the code that asks the server how a route works. Build with bundleApi to ship every route the client calls, or check that the app can load its own chunks.',
    originalError: error instanceof Error ? error : undefined,
  });
}
