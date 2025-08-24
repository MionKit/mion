/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import { loadCompiledCaches } from '@mionkit/core';
import { loadCompiledMethods } from '@mionkit/router';
import { routerCache } from './router.cache';
import { jitFnsCache } from './jitFns.cache';
import { pureFnsCache } from './pureFns.cache';
/**
 * Loads all AOT (Ahead-of-Time) compiled caches into the mion runtime.
 * This function should be called once at application startup to load
 * pre-compiled cache files for optimal performance.
 *
 * The function loads:
 * - JIT functions cache (for runtime type operations)
 * - Pure functions cache (for serialization/deserialization)
 * - Router methods cache (for route handling)
 *
 * @example
 * ```typescript
 * import {loadAOTCaches} from 'my-aot-package';
 *
 * // Load caches at application startup
 * loadAOTCaches();
 *
 * // Now initialize your router and routes
 * import {initRouter, registerRoutes} from '@mionkit/router';
 * const router = initRouter();
 * registerRoutes(myRoutes);
 * ```
 */
export function loadAOTCaches() {
    // Load core caches (JIT and pure functions)
    loadCompiledCaches({
        jitFnsCache,
        pureFnsCache,
    });
    // Load router methods cache
    loadCompiledMethods(routerCache);
}
// Re-export cache objects for advanced use cases
export { routerCache, jitFnsCache, pureFnsCache };
