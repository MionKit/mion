/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeBoolean} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class BooleanRunType extends AtomicRunType<TypeBoolean> {
    _getTypeID = () => ReflectionKind.boolean;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'boolean'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'boolean') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitPrepareForJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitRestoreFromJson(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
