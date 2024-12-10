/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

export const bigIntSerializer: JitSerializer = {
    fromJsonVal(vλl: string): string {
        return `BigInt(${vλl})`;
    },
    toJsonVal(vλl: string): string {
        return `${vλl}.toString()`;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toString()+'"'`;
    },
};
