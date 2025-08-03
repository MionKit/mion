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
        const child = this.getJitChild(comp);
        const childCode = child?.compileIsType(comp);
        const isNonSerializable = !childCode && !child;
        if (isNonSerializable) {
            return {
                code: `${comp.getChildVλl()} === undefined`,
                codeType: 'E',
                skipJit: false
            };
        }
        if (!childCode) return undefined;
        if (this.isRest()) return childCode;
        return {
            code: this.isOptional() ? `(${comp.getChildVλl()} === undefined || (${childCode.code}))` : childCode.code,
            codeType: 'E',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileTypeErrors(comp);
        const isNonSerializable = !childCode && !child;
        if (isNonSerializable) {
            return {
                code: `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErrWithPath('undefined', this.getChildIndex(comp))}`,
                codeType: 'S',
                skipJit: false
            };
        }
        if (!childCode) return undefined;
        if (this.isRest()) return childCode;
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
        const optionalCode = `if (${comp.getChildVλl()} === undefined ) {if (${comp.vλl}.length > ${this.getChildIndex(comp)}) ${comp.getChildVλl()} = null}`;
        if (!child || !childCode) {
            return this.isOptional() ? {
                code: optionalCode,
                codeType: 'S',
                skipJit: false
            } : undefined;
        }
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.isOptional() ? `${optionalCode} else {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        if (!this.getJitChild(comp)) {
            return {
                code: `${comp.getChildVλl()} = undefined;`,
                codeType: 'S',
                skipJit: false
            };
        }
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        const optionalCOde = `if (${comp.getChildVλl()} === null ) {${comp.getChildVλl()} = undefined}`;
        if (!child || !childCode) {
            return this.isOptional() ? {
                code: optionalCOde,
                codeType: 'S',
                skipJit: false
            } : undefined;
        }
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.isOptional() ? `${optionalCOde} else if (${comp.getChildVλl()} !== undefined) {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
}
