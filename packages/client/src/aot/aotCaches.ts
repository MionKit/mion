/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitFnsCache} from 'virtual:client-mion-aot/jit-fns';
import {pureFnsCache} from 'virtual:client-mion-aot/pure-fns';
import {routerCache} from 'virtual:client-mion-aot/router-cache';
import {addAOTCaches, addRoutesToCache, PersistedJitFunctionsCache} from '@mionjs/core';

let aotCachesLoaded = false;

/** Creates a new cache with default values for properties stripped by isClient AOT mode */
function patchClientJitFns(cache: Record<string, any>): PersistedJitFunctionsCache {
    const patched: Record<string, any> = {};
    for (const key in cache) {
        patched[key] = {code: '', args: {}, defaultParamValues: {}, fnID: '', ...cache[key]};
    }
    return patched as PersistedJitFunctionsCache;
}

/** Loads AOT caches into the global cache. Safe to call multiple times. */
export function loadClientAOTCaches() {
    if (aotCachesLoaded) return;
    aotCachesLoaded = true;
    addAOTCaches(patchClientJitFns(jitFnsCache), pureFnsCache);
    addRoutesToCache(routerCache);
}

/** Returns the AOT caches from the virtual module. Used by test utilities to filter and reset caches. */
export function getAOTCaches() {
    return {jitFnsCache, pureFnsCache};
}
