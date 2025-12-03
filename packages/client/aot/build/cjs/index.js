"use strict";
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pureFnsCache = exports.jitFnsCache = void 0;
exports.loadAOTCaches = loadAOTCaches;
const core_1 = require("@mionkit/core");
const jitFns_cache_1 = require("./jitFns.cache");
Object.defineProperty(exports, "jitFnsCache", { enumerable: true, get: function () { return jitFns_cache_1.jitFnsCache; } });
const pureFns_cache_1 = require("./pureFns.cache");
Object.defineProperty(exports, "pureFnsCache", { enumerable: true, get: function () { return pureFns_cache_1.pureFnsCache; } });
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
function loadAOTCaches() {
    // Load core caches (JIT and pure functions)
    (0, core_1.loadPersistedCaches)(jitFns_cache_1.jitFnsCache, pureFns_cache_1.pureFnsCache);
}
