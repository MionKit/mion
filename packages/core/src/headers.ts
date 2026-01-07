/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type HeadersMap<Required extends string, Optional extends string = never> = {[K in Required]: string} & {
    [K in Optional]?: string;
};

export class HeadersSubset<Required extends string, Optional extends string = never> {
    readonly values: {[K in Required]: string} & {[K in Optional]?: string};
    constructor(values: {[K in Required]: string} & {[K in Optional]?: string}) {
        this.values = values;
    }
}
