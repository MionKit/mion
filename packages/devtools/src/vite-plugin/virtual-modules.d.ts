/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/** Exports JIT functions cache data. */
declare module 'virtual:mion-aot/jit-fns' {
    import type {AOTCaches} from '@mionjs/core';
    export const jitFnsCache: AOTCaches['jitFnsCache'];
}

/** Exports pure functions cache data. */
declare module 'virtual:mion-aot/pure-fns' {
    import type {AOTCaches} from '@mionjs/core';
    export const pureFnsCache: AOTCaches['pureFnsCache'];
}

/** Exports router methods cache data. */
declare module 'virtual:mion-aot/router-cache' {
    import type {AOTCaches} from '@mionjs/core';
    export const routerCache: AOTCaches['routerCache'];
}

/**
 * Combined AOT caches module — pure data, no side effects.
 * Import the named `aotCaches` export and pass it to `initMionRouter({ aotCaches })` /
 * `initClient({ aotCaches })` / `loadAOTCaches(aotCaches)`.
 * The individual caches are also exported for advanced use cases.
 *
 * @example
 * import { aotCaches } from 'virtual:mion-aot/caches';
 * await initMionRouter(routes, { aotCaches });
 */
declare module 'virtual:mion-aot/caches' {
    import type {AOTCaches} from '@mionjs/core';
    export const aotCaches: AOTCaches;
    export const jitFnsCache: AOTCaches['jitFnsCache'];
    export const pureFnsCache: AOTCaches['pureFnsCache'];
    export const routerCache: AOTCaches['routerCache'];
}

/** Virtual module for server pure functions extracted from client source at build time. */
declare module 'virtual:mion-server-pure-fns' {
    interface ServerPureFnEntry {
        namespace: string;
        fnName: string;
        paramNames: string[];
        code: string;
        bodyHash: string;
        pureFnDependencies?: string[];
        isFactory: boolean;
        fn: ((...args: any[]) => any) | undefined;
        createFn?: (jitUtils: any) => (...args: any[]) => any;
    }
    export const serverPureFnsCache: Record<string, Record<string, ServerPureFnEntry>>;
}
