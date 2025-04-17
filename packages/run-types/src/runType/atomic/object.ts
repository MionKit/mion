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
    getTypeID = () => ReflectionKind.object;
    _compileIsType(comp: JitCompiler): jitCode {
        return `(typeof ${comp.vλl} === 'object' && ${comp.vλl} !== null)`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
}
