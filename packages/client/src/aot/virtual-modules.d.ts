/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Type declarations for the client's prefixed AOT virtual modules (writeToDiskVirtualId: 'client') */

declare module 'virtual:client-mion-aot/jit-fns' {
    export const jitFnsCache: Record<string, any>;
}

declare module 'virtual:client-mion-aot/pure-fns' {
    export const pureFnsCache: Record<string, Record<string, any>>;
}

declare module 'virtual:client-mion-aot/router-cache' {
    export const routerCache: Record<string, any>;
}

declare module 'virtual:client-mion-aot/caches' {
    export const jitFnsCache: Record<string, any>;
    export const pureFnsCache: Record<string, Record<string, any>>;
    export const routerCache: Record<string, any>;
}
