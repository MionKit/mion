/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    _getTypeID = () => ReflectionKind.undefined;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'undefined'`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitFromJsonVal(): JitCode {
        return {code: `undefined`, type: 'E'};
    }
}
