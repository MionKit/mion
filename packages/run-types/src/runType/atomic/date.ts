/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type TypeClass} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {ReflectionSubKind} from '../../constants.kind';

export class DateRunType extends AtomicRunType<TypeClass> {
    _getTypeID = () => ReflectionSubKind.date;
    _compileIsType(comp: JitCompiler): jitCode {
        return {code: `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (!(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(): jitCode {
        return {code: undefined, type: 'S'};
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {code: `new Date(${comp.vλl})`, type: 'E'};
    }
}
