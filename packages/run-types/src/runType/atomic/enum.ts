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
        return {
            code: `(${items.join(' || ')})`,
            codeType: 'E',
            skipJit: false
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const isTypeCode = this._compileIsType(comp);
        return {
            code: `if (!(${isTypeCode?.code})) ${comp.callJitErr(this)}`,
            codeType: 'S',
            skipJit: false
        };
    }
}
