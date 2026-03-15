/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitFnsCache} from 'virtual:client-mion-aot/jit-fns';
import {pureFnsCache} from 'virtual:client-mion-aot/pure-fns';
import {routerCache} from 'virtual:client-mion-aot/router-cache';
import {addAOTCaches, addRoutesToCache} from '@mionjs/core';

let aotCachesLoaded = false;

/** Loads AOT caches into the global cache. Safe to call multiple times. */
export function loadAOTCaches() {
    if (aotCachesLoaded) return;
    aotCachesLoaded = true;
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

/** Returns the AOT caches from the virtual module. Used by test utilities to filter and reset caches. */
export function getAOTCaches() {
    return {jitFnsCache, pureFnsCache};
}
