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
        return {
            code: `typeof ${comp.vλl} === 'bigint'`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {
            code: `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl}.toString()`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `BigInt(${comp.vλl})`,
            codeType: 'S',
            skipJit: false
        };
    }
}
// bigintTransformer (used internally only so no need to register in JitUtils)

export const bigIntTransformer = {
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `BigInt(${comp.vλl})`,
            codeType: 'S',
            skipJit: false
        };
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl}.toString()`,
            codeType: 'S',
            skipJit: false
        };
    },
};
