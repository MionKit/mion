/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitFnCompiler';
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
    getChildVarName(comp: JitCompiler): string | number {
        return this.index;
    }
    getChildLiteral(comp: JitCompiler) {
        return this.getChildVarName(comp);
    }
    useArrayAccessor() {
        return true;
    }
    isOptional() {
        return false;
    }
    visitIsType(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        if (this.isOptional()) return {code: `${comp.getChildVλl()} === undefined || (${childJit.code})`, type: 'E'};
        return childJit;
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        if (!childJit?.code) return {code: undefined, type: 'S'};
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${childJit.code}}`, type: 'S'};
        return childJit;
    }
    visitToJsonVal(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileToJsonVal(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child); // expressions must be assigned to a variable
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code}` : childJit.code || '';
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileFromJsonVal(child, 'S');
        if (!childJit?.code || !child) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        if (this.isOptional()) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
}
