/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NullRunType extends AtomicRunType<TypeNull> {
    _getTypeID = () => ReflectionKind.null;
    emitIsType(comp: JitFnCompiler): JitCode {
        return {code: `${comp.vλl} === null`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`, type: 'S'};
    }
    emitToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
    emitFromJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
