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
        return {code: `${comp.vλl} === undefined`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return {code: `if (${comp.vλl} !== undefined) ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        return {code: `${comp.vλl} = undefined`, type: 'E'};
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        return {code: `${comp.vλl} = undefined`, type: 'E'};
    }
}
