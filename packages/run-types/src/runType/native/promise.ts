/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, type TypePromise} from '@deepkit/type';
import type {jitCode} from '../../types';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';
import type {JitCompiler} from '@mionkit/run-types/src/lib/jitCompiler';

export class PromiseRunType extends MemberRunType<TypePromise> {
    _getTypeID = () => ReflectionKind.promise;
    skipJit(comp: JitCompiler): boolean {
        return comp?.fnID !== JitFunctions.toCode.id;
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitCompiler): string | number {
        return `p${comp.getNestLevel(this)}`;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildLiteral(comp: JitCompiler): string | number {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): boolean {
        return false;
    }
}
