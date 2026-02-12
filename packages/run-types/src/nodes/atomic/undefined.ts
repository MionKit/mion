/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeUndefined} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import type {JitCode} from '../../types.ts';
import {AtomicRunType} from '../../lib/baseRunTypes.ts';

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'undefined'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitRestoreFromJson(): JitCode {
        return {code: `undefined`, type: 'E'};
    }
}
