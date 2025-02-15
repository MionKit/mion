/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeFormatter} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

// symbolTransformer (used internally only so no need to register in JitUtils)
export const symbolTransformer: JitRunTypeFormatter = {
    kind: ReflectionKind.symbol,
    name: '_symbol',
    // TODO: transformers might need only one function
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
