/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {wrapJitCodeFromCompiler} from '../../lib/utils';

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    _getTypeID = () => ReflectionKind.bigint;
    _compileIsType(comp: JitCompiler): jitCode {
        return wrapJitCodeFromCompiler(`typeof ${comp.vλl} === 'bigint'`, comp);
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return wrapJitCodeFromCompiler(`if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`, comp);
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return bigIntTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return bigIntTransformer._compileFromJsonVal(comp);
    }
}
// bigintTransformer (used internally only so no need to register in JitUtils)

export const bigIntTransformer = {
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return wrapJitCodeFromCompiler(`BigInt(${comp.vλl})`, comp);
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return wrapJitCodeFromCompiler(`${comp.vλl}.toString()`, comp);
    },
};
