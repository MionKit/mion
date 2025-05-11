/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeString} from '@deepkit/type';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class StringRunType extends AtomicRunType<TypeString> {
    _getTypeID = () => ReflectionKind.string;
    _compileIsType(comp: JitCompiler): jitCode {
        return `typeof ${comp.vλl} === 'string'`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (typeof ${comp.vλl} !== 'string') ${comp.callJitErr(this)}`;
    }
}
