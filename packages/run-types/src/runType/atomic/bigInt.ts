/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    _getTypeID = () => ReflectionKind.bigint;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'bigint'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return bigIntTransformer.visitPrepareForJson(comp);
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return bigIntTransformer.visitRestoreFromJson(comp);
    }
}
// bigintTransformer (used internally only so no need to register in JitUtils)

export const bigIntTransformer = {
    visitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: `BigInt(${comp.vλl})`, type: 'E'};
    },
    visitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl}.toString()`, type: 'E'};
    },
};
