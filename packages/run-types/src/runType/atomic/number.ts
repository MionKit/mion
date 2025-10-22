/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    _getTypeID = () => ReflectionKind.number;
    visitIsType(comp: JitCompiler): JitCode {
        return {code: `Number.isFinite(${comp.vλl})`, type: 'E'};
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if(!(Number.isFinite(${comp.vλl}))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    visitToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
    visitFromJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
