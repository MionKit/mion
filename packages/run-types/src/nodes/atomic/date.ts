/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class DateRunType extends AtomicRunType<TypeClass> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (!(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: `new Date(${comp.vλl})`, type: 'E'};
    }
}
