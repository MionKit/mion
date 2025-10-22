/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {ReflectionSubKind} from '../../constants.kind';

export class DateRunType extends AtomicRunType<TypeClass> {
    _getTypeID = () => ReflectionSubKind.date;
    emitIsType(comp: JitCompiler): JitCode {
        return {code: `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (!(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitFromJsonVal(comp: JitCompiler): JitCode {
        return {code: `new Date(${comp.vλl})`, type: 'E'};
    }
}
