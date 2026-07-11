/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeAny, TypeUnknown} from '@deepkit/type';
import type {JitCode} from '../../types.ts';
import {AtomicRunType} from '../../lib/baseRunTypes.ts';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
