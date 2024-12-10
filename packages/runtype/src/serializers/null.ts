/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitSerializer} from '../types';

export const nullSerializer: JitSerializer = {
    fromJsonVal(): undefined {
        return undefined;
    },
    toJsonVal(): undefined {
        return undefined;
    },
    stringify(vλl: string): string {
        return vλl;
    },
};
