/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeTupleMember, type TypeParameter} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {JitCode} from '../../types';
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
    visitIsType(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const skipChild = child?.skipJit(comp);
        const childJit = comp.compileIsType(child, 'E');
        const isNonSerializable = skipChild || (!childJit?.code && !child);
        if (isNonSerializable) return {code: `${comp.getChildVλl()} === undefined`, type: 'E'}; // non serializable types must be undefined
        if (!childJit?.code) return {code: undefined, type: 'E'};
        if (this.isRest()) return childJit;
        return this.isOptional() ? {code: `(${comp.getChildVλl()} === undefined || (${childJit.code}))`, type: 'E'} : childJit;
    }
    visitTypeErrors(comp: JitErrorsCompiler): JitCode {
        const child = this.getJitChild(comp);
        const skipChild = child?.skipJit(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        const isNonSerializable = skipChild || (!childJit?.code && !child);
        if (isNonSerializable)
            return {
                code: `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErrWithPath('undefined', this.getChildIndex(comp))}`,
                type: 'S',
            }; // non serializable types must be undefined
        if (!childJit?.code) return {code: undefined, type: 'S'};
        if (this.isRest()) return childJit;
        return this.isOptional() ? {code: `if (${comp.getChildVλl()} !== undefined) {${childJit.code}}`, type: 'S'} : childJit;
    }
    visitToJsonVal(comp: JitCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileToJsonVal(child, 'S');
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex(comp)}) ${comp.getChildVλl()} = null}`;
        if (!child || !childJit?.code) return this.isOptional() ? {code: optionalCode, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return this.isOptional() ? {code: `${optionalCode} else {${code}}`, type: 'S'} : {code, type: 'S'};
    }
    visitFromJsonVal(comp: JitCompiler): JitCode {
        if (!this.getJitChild(comp)) return {code: `${comp.getChildVλl()} = undefined;`, type: 'S'}; // non serializable are restored to undefined
        const child = this.getJitChild(comp);
        const childJit = comp.compileFromJsonVal(child, 'S');
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childJit?.code) return this.isOptional() ? {code: optionalCOde, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return this.isOptional()
            ? {code: `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'}
            : {code, type: 'S'};
    }
}
