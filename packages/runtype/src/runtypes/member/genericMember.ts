/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {MockOperation, SrcMember} from '../../types';
import {childIsExpression, memorize, toLiteral} from '../../lib/utils';
import {JitFnIDs} from '../../constants';

// TODO: investigate is other member types cloud extend this class instead of MemberRunType
export class GenericMemberRunType<T extends SrcMember> extends MemberRunType<T> {
    index = 0;
    getChildIndex = () => this.index;
    getChildVarName = () => this.index;
    getChildLiteral = memorize(() => toLiteral(this.getChildVarName()));
    useArrayAccessor = () => true;
    isOptional = () => false;
    _compileIsType(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return 'true';
        if (this.isOptional()) {
            return `${comp.getChildVλl()} === undefined || (${child.compileIsType(comp)})`;
        }
        return child.compileIsType(comp);
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const child = this.getJitChild();
        if (!child) return 'true';
        if (this.isOptional()) {
            return `if (${comp.getChildVλl()} !== undefined) {${child.compileTypeErrors(comp)}}`;
        }
        return child.compileTypeErrors(comp);
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(comp);
        console.log('childCode', childCode);
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child);
        console.log('comp.getChildVλl()', comp.getChildVλl());
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.isOptional()) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const argCode = child.compileJsonStringify(comp);
        const isFirst = this.getChildIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.isOptional()) return `(${comp.getChildVλl()} === undefined ? '': ${sep}${argCode})`;
        return `${sep}${argCode}`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        return child.compileHasUnknownKeys(comp);
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        return child.compileUnknownKeyErrors(comp);
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        return child.compileStripUnknownKeys(comp);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        return child.compileUnknownKeysToUndefined(comp);
    }
    _mock(ctx: MockOperation): any {
        return this.getMemberType().mock(ctx);
    }
}
