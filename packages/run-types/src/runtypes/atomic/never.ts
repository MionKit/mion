/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeNever} from '@deepkit/type';
import {AtomicRunType} from '../../lib/baseRunTypes';
import {JitErrorsCompiler} from '../../lib/jitCompiler';
import {JitConfig, jitCode} from '../../types';

const jitConstants: JitConfig = {
    skipJit: false,
    jitId: ReflectionKind.never,
};
export class NeverRunType extends AtomicRunType<TypeNever> {
    getJitConfig = () => jitConstants;
    _compileIsType(): jitCode {
        return 'false';
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        return `${comp.callJitErr(this)}`;
    }
    _compileToJsonVal(): jitCode {
        throw new Error('Never type cannot be encoded to JSON.');
    }
    _compileFromJsonVal(): jitCode {
        throw new Error('Never type cannot be decoded from JSON.');
    }
    _compileJsonStringify(): jitCode {
        throw new Error('Never type cannot be stringified.');
    }
}
