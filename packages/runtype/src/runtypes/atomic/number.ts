/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConstants} from '../../types';
import {getExpected} from '../../lib/utils';
import {mockNumber} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

const jitConstants: JitConstants = {
    skipJit: false,
    skipJsonEncode: true,
    skipJsonDecode: true,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    getJitConstants = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `Number.isFinite(${comp.vλl})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if(!(${this._compileIsType(comp)})) ${comp.callJitErr(getExpected(this))}`;
    }
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(ctx.minNumber, ctx.maxNumber);
    }
}
