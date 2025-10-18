/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeAny, type TypeUnknown} from '@deepkit/type';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class ObjectRunType extends AtomicRunType<TypeAny | TypeUnknown> {
    _getTypeID = () => ReflectionKind.object;
    _compileIsType(comp: JitCompiler): jitCode {
        return {code: `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (!(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)) ${comp.callJitErr(this)}`, type: 'S'};
    }
}
