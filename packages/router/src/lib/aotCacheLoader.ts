/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitFnsCache, pureFnsCache, routerCache} from 'virtual:mion-aot/caches';
import {addAOTCaches, addRoutesToCache} from '@mionjs/core';
import {loadCompiledMethods} from './methodsCache.ts';

/** Loads pre-compiled AOT caches from virtual modules and registers them in the global caches. */
export function loadAOTCaches(): void {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
    loadCompiledMethods(routerCache);
}
