/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '@deepkit/type';
import type {JitCode} from '../../types';
import {toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class EnumRunType extends AtomicRunType<TypeEnum> {
    _getTypeID = () => ReflectionKind.enum;
    visitIsType(comp: JitCompiler): JitCode {
        const items = this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`);
        return {code: `(${items.join(' || ')})`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        const items = this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`);
        return {code: `if (!(${items.join(' || ')})) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
