/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {type TypePromise} from '@deepkit/type';
import type {JitCode} from '../../types.ts';
import {MemberRunType} from '../../lib/baseRunTypes.ts';
import {JitFunctions} from '../../constants.functions.ts';
import type {JitFnCompiler} from '../../lib/jitFnCompiler.ts';

export class PromiseRunType extends MemberRunType<TypePromise> {
    skipJit(comp: JitFnCompiler): boolean {
        return comp?.fnID !== JitFunctions.toJSCode.id;
    }
    emitIsType(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitTypeErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitPrepareForJson(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    emitRestoreFromJson(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    isOptional(): boolean {
        return false;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitFnCompiler): string | number {
        return comp.getLocalVarName('p', this);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildLiteral(comp: JitFnCompiler): string | number {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): boolean {
        return false;
    }
}
