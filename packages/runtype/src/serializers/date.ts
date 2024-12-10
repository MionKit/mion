/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

export const dateSerializer: JitSerializer = {
    fromJsonVal(vλl: string): string {
        return `new Date(${vλl})`;
    },
    ToJsonVal(): undefined {
        return undefined;
    },
    stringify(vλl: string): string {
        return `'"'+${vλl}.toJSON()+'"'`;
    },
};
