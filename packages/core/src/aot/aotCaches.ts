/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AOTCaches} from '../types/general.types.ts';
import {addAOTCaches} from '../jit/jitUtils.ts';
import {addRoutesToCache} from '../routerUtils.ts';

/** Loads AOT caches into @mionjs/core's global registry.
 *  Call once at app startup with caches imported from `virtual:mion-aot/caches`.
 *  Note: this populates @mionjs/core caches only. When using @mionjs/router, call
 *  `initMionRouter({ aotCaches })` instead — it loads core caches AND router-side
 *  persistedMethods. Use this directly only for standalone @mionjs/run-types usage. */
export function loadAOTCaches(caches: AOTCaches): void {
    addAOTCaches(caches.jitFnsCache, caches.pureFnsCache);
    addRoutesToCache(caches.routerCache);
}
