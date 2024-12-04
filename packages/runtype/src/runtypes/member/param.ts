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
    /** If this is set to true undefined will be inserted in the args array
     * instead omitting the element when serializing/deserializing */
    insertUndefined(): boolean {
        return false;
    }
    skipSettingAccessor() {
        return this.isRest();
    }
    hasDefaultValue(): boolean {
        return !!(this.src as TypeParameter).default;
    }
    _compileIsType(comp: JitCompiler) {
        const childCode = this.getJitChild()?.compileIsType(comp);
        if (!childCode) return `${comp.getChildVλl()} === undefined`; // serializable types must be undefined
        if (this.isRest()) return childCode;
        return this.isOptional() ? `${comp.getChildVλl()} === undefined || (${childCode})` : childCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler) {
        const childCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!childCode) return `if (${comp.getChildVλl()} !== undefined) ${comp.callJitErr('undefined', this.getChildIndex())}`; // serializable types must be undefined
        if (this.isRest()) return childCode;
        return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${childCode}}` : childCode;
    }
    _compileJsonEncode(comp: JitCompiler) {
        if (!this.getJitChild()) return `${comp.getChildVλl()} = null;`; // non serializable types are set to null
        const child = this.getJsonEncodeChild();
        const childCode = child?.compileJsonEncode(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (!this.isOptional()) return code;
        const encodeUndefined = this.insertUndefined() ? `${comp.getChildVλl()} = null` : '';
        return encodeUndefined
            ? `if (${comp.getChildVλl()} === undefined ) {${encodeUndefined}} else {${code}}`
            : `if (${comp.getChildVλl()} !== undefined) {${code}}`;
    }
    _compileJsonDecode(comp: JitCompiler) {
        if (!this.getJitChild()) return `${comp.getChildVλl()} = undefined;`; // non serializable are restored to undefined
        const child = this.getJsonDecodeChild();
        const childCode = child?.compileJsonDecode(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (!this.isOptional()) return code;
        const decodeUndefined = this.insertUndefined() ? `${comp.getChildVλl()} = undefined` : '';
        return decodeUndefined
            ? `if (${comp.getChildVλl()} === null ) {${decodeUndefined}} else {${code}}`
            : `if (${comp.getChildVλl()} !== undefined) {${code}}`;
    }
    _compileJsonStringify(comp: JitCompiler) {
        let childCode = this.getJitChild()?.compileJsonStringify(comp);
        if (!childCode) childCode = `null`; // non serializable types are set to null
        if (this.isRest()) return childCode;
        const isFirst = this.getChildIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.isOptional()) return `(${comp.getChildVλl()} === undefined ? '': ${sep}${childCode})`;
        return `${sep}${childCode}`;
    }
    _mock(ctx: MockOperation): any {
        if (!this.getJitChild()) return undefined; // non serializable types are set to undefined
        return this.getMemberType().mock(ctx);
    }
}
