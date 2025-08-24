"use strict";
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
Object.defineProperty(exports, "__esModule", { value: true });
exports.pureFnsCache = exports.jitFnsCache = exports.routerCache = void 0;
exports.loadAOTCaches = loadAOTCaches;
const core_1 = require("@mionkit/core");
const router_1 = require("@mionkit/router");
const router_cache_1 = require("./router.cache");
Object.defineProperty(exports, "routerCache", { enumerable: true, get: function () { return router_cache_1.routerCache; } });
const jitFns_cache_1 = require("./jitFns.cache");
Object.defineProperty(exports, "jitFnsCache", { enumerable: true, get: function () { return jitFns_cache_1.jitFnsCache; } });
const pureFns_cache_1 = require("./pureFns.cache");
Object.defineProperty(exports, "pureFnsCache", { enumerable: true, get: function () { return pureFns_cache_1.pureFnsCache; } });
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
function loadAOTCaches() {
    // Load core caches (JIT and pure functions)
    (0, core_1.loadCompiledCaches)({
        jitFnsCache: jitFns_cache_1.jitFnsCache,
        pureFnsCache: pureFns_cache_1.pureFnsCache,
    });
    // Load router methods cache
    (0, router_1.loadCompiledMethods)(router_cache_1.routerCache);
}
