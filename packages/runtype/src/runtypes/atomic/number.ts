/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockNumber} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {numberSerializer} from '../../serializers/number';

const jitConstants: JitConfig = {
    skipJit: false,
    skipToJsonVal: true,
    skipFromJsonVal: true,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `Number.isFinite(${comp.vλl})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if(!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return numberSerializer.ToJsonVal(comp.vλl);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return numberSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return numberSerializer.stringify(comp.vλl);
    }
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(ctx.minNumber, ctx.maxNumber);
    }
}
