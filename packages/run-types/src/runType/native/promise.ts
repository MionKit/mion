/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, type TypePromise} from '@deepkit/type';
import type {jitCode} from '../../types';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '@mionkit/run-types/src/constants';
import {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';

export class PromiseRunType extends MemberRunType<TypePromise> {
    getTypeID() {
        return ReflectionKind.promise;
    }
    skipJit(comp: JitCompiler): boolean {
        return comp?.fnId !== JitFunctions.toCode.id;
    }
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
