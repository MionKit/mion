/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

export const symbolSerializer: JitSerializer = {
    fromJsonVal(vλl: string): string {
        return `Symbol(${vλl}.substring(7))`;
    },
    ToJsonVal(vλl: string): string {
        return `'Symbol:' + (${vλl}.description || '')`;
    },
    stringify(vλl: string): string {
        return `JSON.stringify('Symbol:' + (${vλl}.description || ''))`;
    },
};
