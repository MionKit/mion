/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, TypeTupleMember, type TypeParameter} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler.ts';
import {MemberRunType} from '../../lib/baseRunTypes.ts';
import {JitCode} from '../../types.ts';
import {childIsExpression, getParamIndex} from '../../lib/utils.ts';

type TupleMemberT = TypeParameter | TypeTupleMember;
export class TupleMemberRunType<T extends TupleMemberT = TypeTupleMember> extends MemberRunType<T> {
    isOptional(): boolean {
        return !!this.src.optional || this.isRest() || this.hasDefaultValue();
    }
    getChildIndex(comp: JitFnCompiler): number {
        const start = comp?.opts?.paramsSlice?.start;
        if (start) return getParamIndex(this.src as TypeParameter) - start;
        return getParamIndex(this.src as TypeParameter);
    }
    getChildVarName(comp: JitFnCompiler): number {
        // For tuple members, use the index in the parent tuple
        const src = this.src as any;
        if (src.parent?.types) {
            return src.parent.types.indexOf(this.src);
        }
        // Fallback to parameter index for non-tuple members
        return this.getChildIndex(comp);
    }
    getChildLiteral(comp: JitFnCompiler): number {
        return this.getChildVarName(comp);
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
    emitIsType(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const skipChild = child?.skipJit(comp);
        const childJit = comp.compileIsType(child, 'E');
        const isNonSerializable = skipChild || (!childJit?.code && !child);
        if (isNonSerializable) return {code: `${comp.getChildVλl()} === undefined`, type: 'E'}; // non serializable types must be undefined
        if (!childJit?.code) return {code: undefined, type: 'E'};
        if (this.isRest()) return childJit;
        return this.isOptional() ? {code: `(${comp.getChildVλl()} === undefined || (${childJit.code}))`, type: 'E'} : childJit;
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
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
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compilePrepareForJson(child, 'S');
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex(comp)}) ${comp.getChildVλl()} = null}`;
        if (!child || !childJit?.code) return this.isOptional() ? {code: optionalCode, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return this.isOptional() ? {code: `${optionalCode} else {${code}}`, type: 'S'} : {code, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        if (!this.getJitChild(comp)) return {code: `${comp.getChildVλl()} = undefined;`, type: 'S'}; // non serializable are restored to undefined
        const child = this.getJitChild(comp);
        const childJit = comp.compileRestoreFromJson(child, 'S');
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childJit?.code) return this.isOptional() ? {code: optionalCOde, type: 'S'} : {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        return this.isOptional()
            ? {code: `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'}
            : {code, type: 'S'};
    }
}
