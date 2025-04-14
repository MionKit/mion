/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, type TypePromise} from '@deepkit/type';
import type {JitConfig, jitCode} from '../../types';
import {MemberRunType} from '../../lib/baseRunTypes';

const jitConstants: JitConfig = {
    skipJit: true,
    jitId: ReflectionKind.promise,
};

export class PromiseRunType extends MemberRunType<TypePromise> {
    _compileIsType(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileTypeErrors(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileToJsonVal(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileFromJsonVal(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    _compileJsonStringify(): jitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }

    getJitConfig() {
        return jitConstants;
    }
    isOptional(): boolean {
        return false;
    }
    getChildVarName(): string | number {
        return 'p';
    }
    getChildLiteral(): string | number {
        return 'p';
    }
    useArrayAccessor(): boolean {
        return false;
    }
}
