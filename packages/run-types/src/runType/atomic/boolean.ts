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

export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    _getTypeID = () => ReflectionKind.boolean;
    _compileIsType(comp: JitCompiler): jitCode {
        return {code: `typeof ${comp.vλl} === 'boolean'`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(): jitCode {
        return {code: undefined, type: 'S'};
    }
    _compileFromJsonVal(): jitCode {
        return {code: undefined, type: 'S'};
    }
}
