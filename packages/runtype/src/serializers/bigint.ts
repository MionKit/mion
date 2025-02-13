/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeTransformer} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';

export const bigIntTransformer: JitRunTypeTransformer = {
    _compileFromJsonVal(comp: JitCompiler): string {
        return `BigInt(${comp.vλl})`;
    },
    _compileToJsonVal(comp: JitCompiler): string {
        return `${comp.vλl}.toString()`;
    },
    _compileJsonStringify(comp: JitCompiler): string {
        return `'"'+${comp.vλl}.toString()+'"'`;
    },
};
