/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeTupleMember, type TypeParameter} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {jitCode} from '../../types';
import {JitFunctions} from '../../constants';
import {childIsExpression, getParamIndex} from '../../lib/utils';

type ParamT = TypeParameter | TypeTupleMember;
export class ParameterRunType<T extends ParamT = TypeParameter> extends MemberRunType<T> {
    isOptional(): boolean {
        return !!this.src.optional || this.isRest() || this.hasDefaultValue();
    }
    getChildIndex(comp?: JitCompiler): number {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getParamIndex(this.src as TypeParameter) - start;
        return getParamIndex(this.src as TypeParameter);
    }
    getChildVarName(comp?: JitCompiler): number {
        return this.getChildIndex(comp);
    }
    getChildLiteral(comp?: JitCompiler): number {
        return this.getChildIndex(comp);
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
    _compileIsType(comp: JitCompiler): jitCode {
        const skipChild = this.getJitChild(comp)?.skipJit(comp);
        const childCode = this.getJitChild(comp)?.compileIsType(comp);
        const isNonSerializable = skipChild || (!childCode && !this.getJitChild(comp));
        if (isNonSerializable) return `${comp.getChildVλl()} === undefined`; // non serializable types must be undefined
        if (!childCode) return undefined;
        if (this.isRest()) return childCode;
        return this.isOptional() ? `(${comp.getChildVλl()} === undefined || (${childCode}))` : childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const skipChild = this.getJitChild(comp)?.skipJit(comp);
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        const isNonSerializable = skipChild || (!childCode && !this.getJitChild(comp));
        if (isNonSerializable)
            return `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErrWithPath('undefined', this.getChildIndex(comp))}`; // non serializable types must be undefined
        if (!childCode) return undefined;
        if (this.isRest()) return childCode;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${childCode}}` : childCode;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex(comp)}) ${comp.getChildVλl()} = null}`;
        if (!child || !childCode) return this.isOptional() ? optionalCode : undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional() ? `${optionalCode} else {${code}}` : code;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        if (!this.getJitChild(comp)) return `${comp.getChildVλl()} = undefined;`; // non serializable are restored to undefined
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childCode) return this.isOptional() ? optionalCOde : undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return this.isOptional() ? `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}` : code;
    }
}
