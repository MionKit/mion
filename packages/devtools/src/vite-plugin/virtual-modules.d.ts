/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * TypeScript declarations for mion AOT virtual modules.
 *
 * These modules are self-registering - they call the appropriate registration
 * functions from @mionkit/core when imported. No exports are provided.
 *
 * Usage:
 * ```ts
 * // In your client entry point
 * import 'virtual:mion-aot/jit-fns';
 * import 'virtual:mion-aot/router-cache';
 * ```
 */

/**
 * Self-registering module for JIT functions and pure functions cache.
 * Calls addAOTCaches() from @mionkit/core on import.
 */
declare module 'virtual:mion-aot/jit-fns' {
    // Self-registering module — no exports
}

/**
 * Self-registering module for pure functions cache (standalone).
 * Calls addAOTCaches() from @mionkit/core on import.
 */
declare module 'virtual:mion-aot/pure-fns' {
    // Self-registering module — no exports
}

/**
 * Self-registering module for router methods cache.
 * Calls addRoutesToCache() from @mionkit/core on import.
 */
declare module 'virtual:mion-aot/router-cache' {
    // Self-registering module — no exports
}

/**
 * Virtual module for client-extracted pure functions.
 * This module exports pure functions extracted from client source code
 * via AST analysis of pureServerFn() calls.
 */
declare module 'virtual:mion-pure-functions' {
    // Self-registering module — no exports
}
