/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// Cache resets for tests, off the main barrel so a browser bundle never carries them.

import {getRTFnCaches, getRTUtils} from '@mionjs/run-types/runtime';
import {jitFunctionsCache, headerJitFunctionsCache} from './jitFunctionsCaches.ts';

/** Build-injected entries re-register from their tuples on next use; pure-fn/format registrations stay. */
export function resetJitFnCaches(): void {
  const utl = getRTUtils();
  const cache = getRTFnCaches().rtFnsCache as Record<string, {rtFnHash: string} | undefined>;
  for (const entry of Object.values(cache)) {
    if (entry) utl.removeFromRTCache(entry as never);
  }
}

/** Clears the compiled-function caches the router and client read through. */
export function resetJitFunctionsCache(): void {
  jitFunctionsCache.clear();
  headerJitFunctionsCache.clear();
}
