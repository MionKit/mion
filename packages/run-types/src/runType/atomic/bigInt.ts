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

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    _getTypeID = () => ReflectionKind.bigint;
    _compileIsType(comp: JitCompiler): jitCode {
        return {code: `typeof ${comp.vλl} === 'bigint'`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`, type: 'S'};
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
        return {code: `BigInt(${comp.vλl})`, type: 'E'};
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    },
};
