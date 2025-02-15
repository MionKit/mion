/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeFormatter} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

const matchRegExpString = '/\\/(.*)\\/(.*)?/';

// regexpTransformer (used internally only so no need to register in JitUtils)
export const regexpTransformer: JitRunTypeFormatter = {
    kind: ReflectionKind.regexp,
    name: '_regexp',
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
