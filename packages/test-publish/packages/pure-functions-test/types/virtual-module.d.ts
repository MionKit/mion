/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

declare module 'virtual:mion-pure-functions' {
    import {PersistedPureFunctionsCache} from '@mionkit/core';

    /** Cache of pure functions keyed by bodyHash, ready to be registered in core */
    export const pureFnsCache: PersistedPureFunctionsCache;
}
