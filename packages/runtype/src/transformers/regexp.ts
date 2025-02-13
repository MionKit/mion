/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeTransformer} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

export const regexpTransformer: JitRunTypeTransformer = {
    _compileFromJsonVal(comp: JitCompiler): string {
        return `(function(){const parts = ${comp.vλl}.match(${matchRegExpString}) ;return new RegExp(parts[1], parts[2] || '')})()`;
    },
    _compileToJsonVal(comp: JitCompiler): string {
        return `${comp.vλl}.toString()`;
    },
    _compileJsonStringify(comp: JitCompiler): string {
        return `JSON.stringify(${comp.vλl}.toString())`;
    },
};
