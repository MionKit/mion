/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeEnum} from '@deepkit/type';
import type {JitCode} from '../../types';
import {toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';

export class EnumRunType extends AtomicRunType<TypeEnum> {
    emitIsType(comp: JitFnCompiler): JitCode {
        const items = this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`);
        return {code: `(${items.join(' || ')})`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const items = this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`);
        return {code: `if (!(${items.join(' || ')})) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
