/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const regexpSerializer: JitSerializer = {
    fromJsonVal(vλl: string): string {
        return `(function(){const parts = ${vλl}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    toJsonVal(vλl: string): string {
        return `${vλl}.toString()`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify(${vλl}.toString())`;
    },
};
