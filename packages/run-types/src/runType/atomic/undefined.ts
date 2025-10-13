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
        return `typeof ${comp.vλl} === 'undefined'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`;
    }
    _compileFromJsonVal(): jitCode {
        return `undefined`;
    }
}
