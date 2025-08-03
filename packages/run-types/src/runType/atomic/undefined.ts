/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    _getTypeID = () => ReflectionKind.undefined;
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `typeof ${comp.vλl} === 'undefined'`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {
            code: `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl} = null`,
            codeType: 'S',
            skipJit: false
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {
            code: `${comp.vλl} = undefined`,
            codeType: 'S',
            skipJit: false
        };
    }
}
