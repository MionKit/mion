/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeUndefined} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {JitCode} from '../../types';
import {AtomicRunType} from '../../lib/baseRunTypes';

export class UndefinedRunType extends AtomicRunType<TypeUndefined> {
    _getTypeID = () => ReflectionKind.undefined;
    _compileIsType(comp: JitCompiler): JitCode {
        return {code: `typeof ${comp.vλl} === 'undefined'`, type: 'E'};
    }
    _compileTypeErrors(comp: JitErrorsCompiler): JitCode {
        return {code: `if (typeof ${comp.vλl} !== 'undefined') ${comp.callJitErr(this)}`, type: 'S'};
    }
    _compileFromJsonVal(): JitCode {
        return {code: `undefined`, type: 'E'};
    }
}
