/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {routesCache} from '@mionjs/core';
import type {MethodWithOptions} from '@mionjs/core';
import {resetJitFnCaches, resetJitFunctionsCache} from '@mionjs/core/testing';
import {purgeHydratedMetadata, resetMetadataCacheState} from '../../src/lib/clientMethodsMetadata.ts';
import {getMetadataStore} from '../../src/lib/metadataStore.ts';
import type {ClientOptions} from '../../src/types.ts';

/** Resets all client caches. Only for testing — simulates app restart.
 *  Leaves the stored cache alone: a page reload keeps it, which is the point of it. */
export function resetClientCaches() {
  const cache = routesCache.getCache();
  for (const key in cache) delete cache[key];
  resetJitFnCaches();
  resetJitFunctionsCache();
  resetMetadataCacheState();
}

/** So the next call to these methods is an optimistic first call */
export async function forgetMetadata(baseURL: string, ...ids: string[]): Promise<void> {
  const cache = routesCache.getCache();
  ids.forEach((id) => delete cache[id]);
  await purgeHydratedMetadata(ids, {baseURL} as ClientOptions);
  const store = await getMetadataStore();
  await store.remove(
    baseURL,
    ids.map((id) => ['m', id] as ['m', string])
  );
}

/** A metadata row with only the fields the client reads. */
export function methodRow(id: string, syncId?: string, paramsJitHash = `p-${id}`, returnJitHash = `r-${id}`): MethodWithOptions {
  return {
    id,
    type: 1,
    paramsJitHash,
    returnJitHash,
    syncId,
    pointer: [id],
    nestLevel: 0,
    isAsync: false,
    hasReturnData: true,
    options: {},
  } as unknown as MethodWithOptions;
}
