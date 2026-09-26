/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';

// Reaches the lane through `#metadata-from-server`, an @mionjs/client `imports` entry no consumer alias can collide with.

type MetadataFromServer = typeof import('./metadataFromServer.ts');

let laneModule: MetadataFromServer | undefined;
let loading: Promise<MetadataFromServer> | undefined;

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

/** The lane if a call already loaded it, never loading it. */
export function loadedMetadataFromServer(): MetadataFromServer | undefined {
  return laneModule;
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
