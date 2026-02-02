/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNull} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NullRunType extends AtomicRunType<TypeNull> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl} === null`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitRestoreFromJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
