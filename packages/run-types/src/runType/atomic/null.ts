/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NullRunType extends AtomicRunType<TypeNull> {
    _getTypeID = () => ReflectionKind.null;
    _compileIsType(comp: JitCompiler): jitCode {
        return {code: `${comp.vλl} === null`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(): jitCode {
        return {code: undefined, type: 'S'};
    }
    _compileFromJsonVal(): jitCode {
        return {code: undefined, type: 'S'};
    }
}
