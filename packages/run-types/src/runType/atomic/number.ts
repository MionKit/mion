/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    _getTypeID = () => ReflectionKind.number;
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `Number.isFinite(${comp.vλl})`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const isTypeCode = this._compileIsType(comp);
        return {
            code: `if(!(${isTypeCode?.code})) ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileToJsonVal(): jitCode {
        return undefined;
    }
    _compileFromJsonVal(): jitCode {
        return undefined;
    }
}
