/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {JitRunTypeFormatter} from '../lib/types';
import type {JitCompiler} from '../lib/jitCompiler';
import {ReflectionKind} from '../lib/_deepkit/src/reflection/type';

// bigintTransformer (used internally only so no need to register in JitUtils)
export const bigIntTransformer: JitRunTypeFormatter = {
    kind: ReflectionKind.bigint,
    name: '_bigint',
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
