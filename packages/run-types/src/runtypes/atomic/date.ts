/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '@deepkit/type';
import type {MockOperation, JitConfig, jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {mockDate} from '../../lib/mock';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {ReflectionSubKind} from '../../constants.kind';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionSubKind.date,
};

export class DateRunType extends AtomicRunType<TypeClass> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(): jitCode {
        return undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return `new Date(${comp.vλl})`;
    }
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return `'"'+${comp.vλl}.toJSON()+'"'`;
    }
    _mock(ctx: Pick<MockOperation, 'minDate' | 'maxDate'>): Date {
        return mockDate(ctx.minDate, ctx.maxDate);
    }
}
