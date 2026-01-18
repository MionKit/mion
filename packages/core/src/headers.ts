/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

// type-headers-subset-start
/** Type-safe wrapper for HTTP headers */
export class HeadersSubset<Required extends string, Optional extends string = never> {
    readonly headers: {[K in Required]: string} & {[K in Optional]?: string};
    constructor(headers: {[K in Required]: string} & {[K in Optional]?: string}) {
        this.headers = headers;
    }
}
// type-headers-subset-end
