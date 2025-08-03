/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {SrcMember, jitCode} from '../../types';
import {childIsExpression} from '../../lib/utils';
import {JitFunctions} from '../../constants.functions';

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
    _compileIsType(comp: JitCompiler): jitCode {
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!childCode) return undefined;
        return {
            code: this.isOptional() ? `${comp.getChildVλl()} === undefined || (${childCode.code})` : childCode.code,
            codeType: 'E',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!childCode) return undefined;
        return {
            code: this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${childCode.code}}` : childCode.code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child); // expressions must be assigned to a variable
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
}
