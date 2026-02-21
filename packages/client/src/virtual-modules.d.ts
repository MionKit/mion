/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PersistedJitFunctionsCache, PersistedPureFunctionsCache, MethodsCache} from '@mionkit/core';

declare module 'virtual:mion-aot/jit-fns' {
    export const jitFnsCache: PersistedJitFunctionsCache;
}

declare module 'virtual:mion-aot/pure-fns' {
    export const pureFnsCache: PersistedPureFunctionsCache;
}

declare module 'virtual:mion-aot/router-cache' {
    export const routerCache: MethodsCache;
}

declare module 'virtual:mion-aot/caches' {
    export const jitFnsCache: PersistedJitFunctionsCache;
    export const pureFnsCache: PersistedPureFunctionsCache;
    export const routerCache: MethodsCache;
}
