/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitConfig, jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `typeof ${comp.vλl} === 'bigint'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`;
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
        return `BigInt(${comp.vλl})`;
    },
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return `${comp.vλl}.toString()`;
    },
};
