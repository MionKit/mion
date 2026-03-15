/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getRawAOTCaches, loadAOTCaches} from '@mionjs/core/aot-caches';
import {loadCompiledMethods} from '../lib/methodsCache.ts';

/** Loads pre-compiled AOT caches from virtual modules and registers them in the global caches. */
export function loadRouterAOTCaches(): void {
    loadAOTCaches();
    loadCompiledMethods(getRawAOTCaches().routerCache);
}
