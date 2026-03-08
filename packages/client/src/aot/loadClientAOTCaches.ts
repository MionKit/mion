/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * Static AOT caches entry point for non-Vite users.
 *
 * Import this module and call loadClientAotCaches() before using the client:
 *
 * ```ts
 * import { loadClientAotCaches } from '@mionjs/client/aot';
 * loadClientAotCaches();
 *
 * import { initClient } from '@mionjs/client';
 * ```
 *
 * In source (dev/test): virtual modules are resolved by the Vite plugin.
 * In production: the built `aot/build/esm/index.js` imports from disk files.
 */

import {addAOTCaches, addRoutesToCache} from '@mionjs/core';
import {jitFnsCache} from 'virtual:client-mion-aot/jit-fns';
import {pureFnsCache} from 'virtual:client-mion-aot/pure-fns';
import {routerCache} from 'virtual:client-mion-aot/router-cache';

/** Loads the pre-generated minimal AOT caches into the client's global cache. */
export function loadClientAotCaches() {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

export {jitFnsCache, pureFnsCache, routerCache};
