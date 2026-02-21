/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Exports JIT functions cache data. */
declare module 'virtual:mion-aot/jit-fns' {
    export const jitFnsCache: Record<string, any>;
}

/** Exports pure functions cache data. */
declare module 'virtual:mion-aot/pure-fns' {
    export const pureFnsCache: Record<string, Record<string, any>>;
}

/** Exports router methods cache data. */
declare module 'virtual:mion-aot/router-cache' {
    export const routerCache: Record<string, any>;
}

/**
 * Combined AOT caches module.
 * Imports all 3 cache modules, registers them via addAOTCaches() and addRoutesToCache(),
 * and re-exports the cache data for manual re-registration (e.g. after resetClientCaches in tests).
 */
declare module 'virtual:mion-aot/caches' {
    export const jitFnsCache: Record<string, any>;
    export const pureFnsCache: Record<string, Record<string, any>>;
    export const routerCache: Record<string, any>;
}

/** Virtual module for client-extracted pure functions. */
declare module 'virtual:mion-pure-functions' {
    // Self-registering module — no exports
}
