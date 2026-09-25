/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {routesCache} from '@mionjs/core';
import {resetJitFnCaches, resetJitFunctionsCache} from '@mionjs/core/testing';
import {resetMetadataCacheState} from '../../src/lib/clientMethodsMetadata.ts';

/** Resets all client caches. Only for testing — simulates app restart.
 *  Leaves the stored cache alone: a page reload keeps it, which is the point of it. */
export function resetClientCaches() {
  const cache = routesCache.getCache();
  for (const key in cache) delete cache[key];
  resetJitFnCaches();
  resetJitFunctionsCache();
  resetMetadataCacheState();
}
