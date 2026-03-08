/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {addAOTCaches, addRoutesToCache} from '@mionjs/core';
import {jitFnsCache} from 'virtual:client-mion-aot/jit-fns';
import {pureFnsCache} from 'virtual:client-mion-aot/pure-fns';
import {routerCache} from 'virtual:client-mion-aot/router-cache';
import {initClient} from '../client.ts';
import {InitClientOptions} from '../types.ts';
import type {RemoteApi} from '@mionjs/router';

/** Loads the pre-generated minimal AOT caches into the client's global cache. */
export function loadClientAotCaches() {
    addAOTCaches(jitFnsCache, pureFnsCache);
    addRoutesToCache(routerCache);
}

/** Loads pre-generated AOT caches and initializes the client in one call. */
export function initAOTClient<RM extends RemoteApi>(options: InitClientOptions) {
    loadClientAotCaches();
    return initClient<RM>(options);
}
