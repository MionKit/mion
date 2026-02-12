/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNever} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes.ts';
import {JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import {JitCode} from '../../types.ts';

export class NeverRunType extends AtomicRunType<TypeNever> {
    emitIsType(): JitCode {
        return {code: 'false', type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(): JitCode {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    emitRestoreFromJson(): JitCode {
        throw new Error('Never type cannot be decoded from JSON.');
    }
}
