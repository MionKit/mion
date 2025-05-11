/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNever} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitErrorsCompiler} from '../../lib/jitCompiler';
import {jitCode} from '../../types';

export class NeverRunType extends AtomicRunType<TypeNever> {
    _getTypeID = () => ReflectionKind.never;
    _compileIsType(): jitCode {
        return 'false';
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(): jitCode {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    _compileFromJsonVal(): jitCode {
        throw new Error('Never type cannot be decoded from JSON.');
    }
}
