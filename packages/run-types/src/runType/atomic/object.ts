/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.object;
    visitIsType(comp: JitCompiler): JitCode {
        return {code: `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
