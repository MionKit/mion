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

const jitConstants: JitConfig = {
    skipJit: false,
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
    _compileToJsonVal() {
        return undefined;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        return `new Date(${comp.vλl})`;
    }
    _compileJsonStringify(comp: JitCompiler) {
        return `'"'+${comp.vλl}.toJSON()+'"'`;
    }
    _mock(ctx: Pick<MockOperation, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx.minDate, ctx.maxDate);
    }
}
