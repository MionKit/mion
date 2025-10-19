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
import {JitFunctions} from '../../constants.functions';
import {childIsExpression, getParamIndex} from '../../lib/utils';

type ParamT = TypeParameter | TypeTupleMember;
export class ParameterRunType<T extends ParamT = TypeParameter> extends MemberRunType<T> {
    isOptional(): boolean {
        return !!this.src.optional || this.isRest() || this.hasDefaultValue();
    }
    getChildIndex(comp: JitCompiler): number {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getParamIndex(this.src as TypeParameter) - start;
        return getParamIndex(this.src as TypeParameter);
    }
    getChildVarName(comp: JitCompiler): number {
        return this.getChildIndex(comp);
    }
    getChildLiteral(comp: JitCompiler): number {
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
        const isNonSerializable = skipChild || (!childCode?.code && !this.getJitChild(comp));
        if (isNonSerializable) return {code: `${comp.getChildVλl()} === undefined`, type: 'E'}; // non serializable types must be undefined
        if (!childCode?.code) return {code: undefined, type: 'E'};
        if (this.isRest()) return childCode;
        return this.isOptional() ? {code: `(${comp.getChildVλl()} === undefined || (${childCode.code}))`, type: 'E'} : childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const skipChild = this.getJitChild(comp)?.skipJit(comp);
        const childCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        const isNonSerializable = skipChild || (!childCode?.code && !this.getJitChild(comp));
        if (isNonSerializable)
            return {
                code: `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErrWithPath('undefined', this.getChildIndex(comp))}`,
                type: 'S',
            }; // non serializable types must be undefined
        if (!childCode?.code) return {code: undefined, type: 'S'};
        if (this.isRest()) return childCode;
        return this.isOptional() ? {code: `if (${comp.getChildVλl()} !== undefined) {${childCode.code}}`, type: 'S'} : childCode;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex(comp)}) ${comp.getChildVλl()} = null}`;
        if (!child || !childCode?.code) return this.isOptional() ? {code: optionalCode, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return this.isOptional() ? {code: `${optionalCode} else {${code}}`, type: 'S'} : {code, type: 'S'};
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        if (!this.getJitChild(comp)) return {code: `${comp.getChildVλl()} = undefined;`, type: 'S'}; // non serializable are restored to undefined
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childCode?.code) return this.isOptional() ? {code: optionalCOde, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return this.isOptional()
            ? {code: `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'}
            : {code, type: 'S'};
    }
}
