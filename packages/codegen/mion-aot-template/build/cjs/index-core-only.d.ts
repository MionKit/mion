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
export declare function loadAOTCaches(): void;
export { jitFnsCache, pureFnsCache };
