/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// use named imports to work properly with vite-plugin-mion
import {jitFnsCache, pureFnsCache, routerCache} from './emptyCaches.ts';
import {addAOTCaches, addRoutesToCache} from '@mionjs/core';

/** Loads pre-compiled AOT caches from virtual modules and registers them in the global caches. */
export function loadAOTCaches(): void {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

/** Returns the global caches. */
export function getRawAOTCaches() {
    return {
        jitFnsCache,
        pureFnsCache,
        routerCache,
    };
}
