/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNull} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NullRunType extends AtomicRunType<TypeNull> {
    _getTypeID = () => ReflectionKind.null;
    visitIsType(comp: JitCompiler): JitCode {
        return {code: `${comp.vλl} === null`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (${comp.vλl} !== null) ${comp.callJitErr(this)}`, type: 'S'};
    }
    visitToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
    visitFromJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
