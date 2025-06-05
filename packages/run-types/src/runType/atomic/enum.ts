/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeEnum} from '@deepkit/type';
import type {jitCode} from '../../types';
import {toLiteral} from '../../lib/utils';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class EnumRunType extends AtomicRunType<TypeEnum> {
    _getTypeID = () => ReflectionKind.enum;
    _compileIsType(comp: JitCompiler): jitCode {
        const items = this.src.values.map((v) => `${comp.vλl} === ${toLiteral(v)}`);
        return `(${items.join(' || ')})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
}
