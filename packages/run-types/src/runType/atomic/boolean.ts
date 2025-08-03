/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '@deepkit/type';
import type {jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';

export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    _getTypeID = () => ReflectionKind.boolean;
    _compileIsType(comp: JitCompiler): jitCode {
        return {
            code: `typeof ${comp.vλl} === 'boolean'`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {
            code: `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(this)}`,
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
