/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeTransformer} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';

export const symbolTransformer: JitRunTypeTransformer = {
    _compileFromJsonVal(comp: JitCompiler): string {
        return `Symbol(${comp.vλl}.substring(7))`;
    },
    _compileToJsonVal(comp: JitCompiler): string {
        return `'Symbol:' + (${comp.vλl}.description || '')`;
    },
    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify('Symbol:' + (${comp.vλl}.description || ''))`;
    },
};
