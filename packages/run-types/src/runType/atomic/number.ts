/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '@deepkit/type';
import type {JitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class NumberRunType extends AtomicRunType<TypeNumber> {
    _getTypeID = () => ReflectionKind.number;
    _compileIsType(comp: JitCompiler): JitCode {
        return {code: `Number.isFinite(${comp.vλl})`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if(!(Number.isFinite(${comp.vλl}))) ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileToJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
    _compileFromJsonVal(): JitCode {
        return {code: undefined, type: 'S'};
    }
}
