/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '@deepkit/type';
import type {jitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';

export class VoidRunType extends AtomicRunType<TypeVoid> {
    _getTypeID = () => ReflectionKind.void;
    _compileIsType(comp: JitCompiler): jitCode {
        return `${comp.vλl} === undefined`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if (${comp.vλl} !== undefined) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return `${comp.vλl} = undefined`;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return `${comp.vλl} = undefined`;
    }
}
