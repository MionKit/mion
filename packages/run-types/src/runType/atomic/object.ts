/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.object;
    emitIsType(comp: JitCompiler): JitCode {
        return {code: `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
