/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {MockOperation, JitConfig} from '../../types';
import {mockBigInt} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    _getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'bigint'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return bigIntTransformer._compileToJsonVal(comp);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return bigIntTransformer._compileFromJsonVal(comp);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return bigIntTransformer._compileJsonStringify(comp);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx.minNumber, ctx.maxNumber);
    }
}
// bigintTransformer (used internally only so no need to register in JitUtils)

export const bigIntTransformer = {
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
