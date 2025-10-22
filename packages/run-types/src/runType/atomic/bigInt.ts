/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    _getTypeID = () => ReflectionKind.bigint;
    visitIsType(comp: JitCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'bigint'`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`, type: 'S'};
    }
    visitToJsonVal(comp: JitCompiler): JitCode {
        return bigIntTransformer.visitToJsonVal(comp);
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        return bigIntTransformer.visitFromJsonVal(comp);
    }
}
// bigintTransformer (used internally only so no need to register in JitUtils)

export const bigIntTransformer = {
    visitFromJsonVal(comp: JitCompiler): JitCode {
        return {code: `BigInt(${comp.vλl})`, type: 'E'};
    },
    visitToJsonVal(comp: JitCompiler): JitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    },
};
