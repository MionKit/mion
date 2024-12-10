/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

export const undefinedSerializer: JitSerializer = {
    fromJsonVal(vλl: string): string {
        return `${vλl} = undefined`;
    },
    ToJsonVal(vλl: string): string {
        return `${vλl} = null`;
    },
    stringify(): string {
        return `null`;
    },
};
