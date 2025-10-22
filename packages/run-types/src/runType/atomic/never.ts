/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNever} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitErrorsCompiler} from '../../lib/jitFnCompiler';
import {JitCode} from '../../types';

export class NeverRunType extends AtomicRunType<TypeNever> {
    _getTypeID = () => ReflectionKind.never;
    emitIsType(): JitCode {
        return {code: 'false', type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `${comp.callJitErr(this)}`, type: 'S'};
    }
    emitToJsonVal(): JitCode {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    emitFromJsonVal(): JitCode {
        throw new Error('Never type cannot be decoded from JSON.');
    }
}
