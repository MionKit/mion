/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// this caches will be replaced by a virtual module by the mion Vite plugin with actual AOT caches when AOT is enabled
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
