/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '@deepkit/type';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';

export class StringRunType extends AtomicRunType<TypeString> {
    _getTypeID = () => ReflectionKind.string;
    visitIsType(comp: JitCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'string'`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'string') ${comp.callJitErr(this)}`, type: 'S'};
    }
}
