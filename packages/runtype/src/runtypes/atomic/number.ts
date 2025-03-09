/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '@deepkit/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockNumber} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    _getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `Number.isFinite(${comp.vλl})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if(!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal() {
        return undefined;
    }
    _compileFromJsonVal() {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler) {
        return comp.vλl;
    }
    _mock(ctx: Pick<MockOperation, 'minNumber' | 'maxNumber'>): number {
        return mockNumber(ctx.minNumber, ctx.maxNumber);
    }
}
