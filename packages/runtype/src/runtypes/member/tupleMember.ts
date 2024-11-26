/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeTupleMember} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {JitConstants, MockOperation, Mutable} from '../../types';
import {JitFnIDs} from '../../constants';
import {childIsExpression} from '../../lib/utils';

export class TupleMemberRunType extends MemberRunType<TypeTupleMember> {
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        const constants = super.getJitConstants(stack) as Mutable<JitConstants>;
        if (this.isOptional()) {
            constants.skipJsonDecode = false;
            constants.skipJsonEncode = false;
            constants.skipJit = false;
        }
        return constants;
    }
    getChildVarName(): number {
        return this.src.parent.types.indexOf(this.src);
    }
    getChildLiteral(): number {
        return this.getChildVarName();
    }
    useArrayAccessor(): true {
        return true;
    }
    isOptional(): boolean {
        return !!this.src.optional;
    }
    _compileIsType(comp: JitCompiler): string {
        const itemCode = this.getMemberType().compileIsType(comp);
        return this.isOptional() ? `(${comp.getChildVλl()} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const itemCode = this.getMemberType().compileTypeErrors(comp);
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return this.isOptional() ? `if (${comp.getChildVλl()} === undefined ) {${comp.getChildVλl()} = null}` : '';
        const childCode = child.compileJsonEncode(comp);
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional()
            ? `if (${comp.getChildVλl()} === undefined ) {${comp.getChildVλl()} = null} else {${code}}`
            : code;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return this.isOptional() ? `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}` : '';
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional()
            ? `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined} else {${code}}`
            : code;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const itemCode = this.getMemberType().compileJsonStringify(comp);
        return this.isOptional() ? `(${comp.getChildVλl()} === undefined ? null : ${itemCode})` : itemCode;
    }
    _mock(ctx: Pick<MockOperation, 'optionalProbability'>): any {
        if (this.isOptional()) {
            const probability = ctx.optionalProbability;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (Math.random() > probability) {
                return undefined;
            }
        }
        return this.getMemberType().mock(ctx);
    }
}
