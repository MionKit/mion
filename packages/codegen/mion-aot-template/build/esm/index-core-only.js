/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import { loadPersistedCaches } from '@mionkit/core';
import { jitFnsCache } from './jitFns.cache';
import { pureFnsCache } from './pureFns.cache';
/**
 * Loads all AOT (Ahead-of-Time) compiled caches into the mion runtime.
 * This is the core-only version that does not include router caches.
 *
 * This function should be called once at application startup to load
 * pre-compiled cache files for optimal performance.
 *
 * The function loads:
 * - JIT functions cache (for runtime type operations)
 * - Pure functions cache (for serialization/deserialization)
 *
 * @example
 * ```typescript
 * import {loadAOTCaches} from 'my-aot-package';
 *
 * // Load caches at application startup
 * loadAOTCaches();
 *
 * // Now use mion core functionality
 * ```
 */
export function loadAOTCaches() {
    // Load core caches (JIT and pure functions)
    loadPersistedCaches(jitFnsCache, pureFnsCache);
}
// Re-export cache objects for advanced use cases
export { jitFnsCache, pureFnsCache };
