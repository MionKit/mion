/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

declare module 'virtual:mion-server-pure-fns' {
    import {PersistedPureFunctionsCache} from '@mionjs/core';

    /** Cache of pure functions keyed by bodyHash, ready to be registered in core */
    export const pureFnsCache: PersistedPureFunctionsCache;
}
