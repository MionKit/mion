/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBigInt} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {MockOperation, JitConfig} from '../../types';
import {mockBigInt} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {bigIntSerializer} from '../../serializers/bigint';

const jitConstants: JitConfig = {
    skipJit: false,
    skipJsonEncode: false,
    skipJsonDecode: false,
    jitId: ReflectionKind.bigint,
};

export class BigIntRunType extends AtomicRunType<TypeBigInt> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `typeof ${comp.vλl} === 'bigint'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (typeof ${comp.vλl} !== 'bigint') ${comp.callJitErr(this)}`;
    }
    _compileJsonEncode(comp: JitCompiler) {
        return bigIntSerializer.toJsonVal(comp.vλl);
    }
    _compileJsonDecode(comp: JitCompiler) {
        return bigIntSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return bigIntSerializer.stringify(comp.vλl);
    }
    /** mocks a regular number and transforms into a bigint.
     * this means range is limited to Number.MAX_SAFE_INTEGER
     */
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): bigint {
        return mockBigInt(ctx.minNumber, ctx.maxNumber);
    }
}
