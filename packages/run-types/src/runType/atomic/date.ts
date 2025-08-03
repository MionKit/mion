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
import {JitFunctions} from '../../constants.functions';

export class DateRunType extends AtomicRunType<TypeClass> {
    _getTypeID = () => ReflectionSubKind.date;
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `(${comp.vλl} instanceof Date && !isNaN(${comp.vλl}.getTime()))`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const isTypeCode = this._compileIsType(comp);
        return {
            code: `if (!(${isTypeCode?.code})) ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileToJsonVal(): jitCode {
        return undefined;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `new Date(${comp.vλl})`,
            codeType: 'S',
            skipJit: false
        };
    }
}
