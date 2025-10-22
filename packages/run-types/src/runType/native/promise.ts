/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, type TypePromise} from '@deepkit/type';
import type {JitCode} from '../../types';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitFunctions} from '../../constants.functions';
import type {JitCompiler} from '../../lib/jitFnCompiler';

export class PromiseRunType extends MemberRunType<TypePromise> {
    _getTypeID = () => ReflectionKind.promise;
    skipJit(comp: JitCompiler): boolean {
        return comp?.fnID !== JitFunctions.toJavascript.id;
    }
    visitIsType(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitTypeErrors(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitToJsonVal(): JitCode {
        throw new Error(`Jit compilation disabled for Non Serializable types.`);
    }
    visitFromJsonVal(): JitCode {
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
