/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {MockOperation, SrcMember} from '../../types';
import {childIsExpression} from '../../lib/utils';
import {JitFnIDs} from '../../constants';

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
        const childCode = this.getJitChild()?.compileIsType(comp);
        if (!childCode) return undefined;
        if (this.isOptional()) return `${comp.getChildVλl()} === undefined || (${childCode})`;
        return childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const childCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${childCode}}`;
        return childCode;
    }
    _compileJsonEncode(comp: JitCompiler) {
        const child = this.getJsonEncodeChild();
        const childCode = child?.compileJsonEncode(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child); // expressions must be assigned to a variable
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonDecode(comp: JitCompiler) {
        const child = this.getJsonDecodeChild();
        const childCode = child?.compileJsonDecode(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonStringify(comp: JitCompiler) {
        const child = this.getJitChild();
        const argCode = child?.compileJsonStringify(comp);
        if (!argCode) return undefined;
        const isFirst = this.getChildIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.isOptional()) return `(${comp.getChildVλl()} === undefined ? '': ${sep}${argCode})`;
        return `${sep}${argCode}`;
    }
    _mock(ctx: MockOperation): any {
        return this.getMemberType().mock(ctx);
    }
}
