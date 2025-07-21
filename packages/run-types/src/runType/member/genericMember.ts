/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {SrcMember} from '../../types';
import {childIsExpression} from '../../lib/utils';
import {JitFunctions} from '../../constants.functions';

// TODO: investigate is other member types cloud extend this class instead of MemberRunType
export class GenericMemberRunType<T extends SrcMember> extends MemberRunType<T> {
    index = 0;
    getChildIndex() {
        return this.index;
    }
    getChildVarName(): string | number {
        return this.index;
    }
    getChildLiteral() {
        return this.getChildVarName();
    }
    useArrayAccessor() {
        return true;
    }
    isOptional() {
        return false;
    }
    _compileIsType(comp: JitCompiler) {
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!childCode) return undefined;
        if (this.isOptional()) return `${comp.getChildVλl()} === undefined || (${childCode})`;
        return childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${childCode}}`;
        return childCode;
    }
    _compileToJsonVal(comp: JitCompiler) {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child); // expressions must be assigned to a variable
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
}
