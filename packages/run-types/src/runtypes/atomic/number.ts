/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNumber} from '@deepkit/type';
import type {JitConfig, jitCode} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {AtomicRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.number,
};

export class NumberRunType extends AtomicRunType<TypeNumber> {
    getJitConfig = () => jitConstants;
    _compileIsType(comp: JitCompiler): jitCode {
        return `Number.isFinite(${comp.vλl})`;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `if(!(${this._compileIsType(comp)})) ${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(): jitCode {
        return undefined;
    }
    _compileFromJsonVal(): jitCode {
        return undefined;
    }
    _compileJsonStringify(comp: JitCompiler): jitCode {
        return comp.vλl;
    }
}
