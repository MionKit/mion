/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '../../lib/_deepkit/src/reflection/type';
import type {MockOperation, JitConfig} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockDate} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {ReflectionSubKind} from '../../constants.kind';
import {dateSerializer} from '../../serializers/date';

const jitConstants: JitConfig = {
    skipJit: false,
    skipToJsonVal: true,
    skipFromJsonVal: false,
    jitId: ReflectionSubKind.date,
};

export class DateRunType extends AtomicRunType<TypeClass> {
    getJitId = () => jitConstants.jitId;
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): string {
        return `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler) {
        return dateSerializer.ToJsonVal(comp.vλl);
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return dateSerializer.fromJsonVal(comp.vλl);
    }
    _compileJsonStringify(comp: JitCompiler) {
        return dateSerializer.stringify(comp.vλl);
    }
    _mock(ctx: Pick<MockOperation, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx.minDate, ctx.maxDate);
    }
}
