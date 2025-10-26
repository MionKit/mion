/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeVoid} from '@deepkit/type';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';

export class VoidRunType extends AtomicRunType<TypeVoid> {
    _getTypeID = () => ReflectionKind.void;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl} === undefined`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (${comp.vλl} !== undefined) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl} = undefined`, type: 'E'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl} = undefined`, type: 'E'};
    }
}
