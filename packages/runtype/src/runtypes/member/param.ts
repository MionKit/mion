/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeTupleMember, type TypeParameter} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {MockOperation} from '../../types';
import {JitFnIDs} from '../../constants';
import {childIsExpression, getParamIndex} from '../../lib/utils';

type ParamT = TypeParameter | TypeTupleMember;
export class ParameterRunType<T extends ParamT = TypeParameter> extends MemberRunType<T> {
    isOptional(): boolean {
        return !!this.src.optional || this.isRest() || this.hasDefaultValue();
    }
    getChildIndex(): number {
        return getParamIndex(this.src as TypeParameter);
    }
    getChildVarName(): number {
        return this.getChildIndex();
    }
    getChildLiteral(): number {
        return this.getChildIndex();
    }
    useArrayAccessor(): true {
        return true;
    }
    isRest(): boolean {
        return this.getMemberType().src.kind === ReflectionKind.rest;
    }
    skipSettingAccessor() {
        return this.isRest();
    }
    hasDefaultValue(): boolean {
        return !!(this.src as TypeParameter).default;
    }
    _compileIsType(comp: JitCompiler) {
        const childCode = this.getJitChild()?.compileIsType(comp);
        if (!childCode) return `${comp.getChildVλl()} === undefined`; // non serializable types must be undefined
        if (this.isRest()) return childCode;
        return this.isOptional() ? `${comp.getChildVλl()} === undefined || (${childCode})` : childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const childCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!childCode) return `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErr('undefined', this.getChildIndex())}`; // non serializable types must be undefined
        if (this.isRest()) return childCode;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${childCode}}` : childCode;
    }
    _compileToJsonVal(comp: JitCompiler) {
        const child = this.getJitChild();
        const childCode = child?.compileToJsonVal(comp);
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex()}) ${comp.getChildVλl()} = null}`;
        if (!child || !childCode) return this.isOptional() ? optionalCode : undefined;
        const isExpression = childIsExpression(JitFnIDs.toJsonVal, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional() ? `${optionalCode} else {${code}}` : code;
    }
    _compileFromJsonVal(comp: JitCompiler) {
        if (!this.getJitChild()) return `${comp.getChildVλl()} = undefined;`; // non serializable are restored to undefined
        const child = this.getJitChild();
        const childCode = child?.compileFromJsonVal(comp);
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childCode) return this.isOptional() ? optionalCOde : undefined;
        const isExpression = childIsExpression(JitFnIDs.fromJsonVal, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional() ? `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
    _compileJsonStringify(comp: JitCompiler) {
        let childCode = this.getJitChild()?.compileJsonStringify(comp);
        if (!childCode) childCode = `null`; // non serializable types are set to null
        if (this.isRest()) return childCode;
        const isFirst = this.getChildIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.isOptional()) return `(${comp.getChildVλl()} === undefined ? ${sep}'null' : ${sep}${childCode})`;
        return `${sep}${childCode}`;
    }
    _mock(ctx: MockOperation): any {
        if (!this.getJitChild()) return undefined; // non serializable types are set to undefined
        if (this.isOptional() && !this.isRest()) {
            const probability = ctx.optionalProbability;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (Math.random() > probability) {
                return undefined;
            }
        }
        return this.getMemberType().mock(ctx);
    }
}
