/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeNumber} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `Number.isFinite(${comp.vλl})`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if(!(Number.isFinite(${comp.vλl}))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitRestoreFromJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
