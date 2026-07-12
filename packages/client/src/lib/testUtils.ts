/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {resetJitFunctionsCache, routesCache} from '@mionjs/core';
import {resetJitFnCaches} from '@mionjs/run-types';

/** Resets all client caches. Only for testing — simulates app restart. */
export function resetClientCaches() {
    const cache = routesCache.getCache();
    for (const key in cache) delete cache[key];
    resetJitFnCaches();
    resetJitFunctionsCache();
}
