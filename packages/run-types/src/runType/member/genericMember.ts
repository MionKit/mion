/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import type {JitCode, SrcMember} from '../../types';
import {childIsExpression} from '../../lib/utils';

// TODO: investigate is other member types cloud extend this class instead of MemberRunType
export class GenericMemberRunType<T extends SrcMember> extends MemberRunType<T> {
    index = 0;
    getChildIndex() {
        return this.index;
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitFnCompiler): string | number {
        return this.index;
    }
    getChildLiteral(comp: JitFnCompiler) {
        return this.getChildVarName(comp);
    }
    useArrayAccessor() {
        return true;
    }
    isOptional() {
        return false;
    }
    emitIsType(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        if (this.isOptional()) return {code: `${comp.getChildVλl()} === undefined || (${childJit.code})`, type: 'E'};
        return childJit;
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        if (!childJit?.code) return {code: undefined, type: 'S'};
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${childJit.code}}`, type: 'S'};
        return childJit;
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compilePrepareForJson(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child); // expressions must be assigned to a variable
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code}` : childJit.code || '';
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileRestoreFromJson(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
}
