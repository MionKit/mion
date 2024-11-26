/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeParameter} from '../../lib/_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {MockOperation} from '../../types';
import {JitFnIDs} from '../../constants';
import {childIsExpression, getParamIndex} from '../../lib/utils';

export class ParameterRunType extends MemberRunType<TypeParameter> {
    isOptional(): boolean {
        return !!this.src.optional || this.isRest() || this.hasDefaultValue();
    }
    getChildIndex(): number {
        return getParamIndex(this.src);
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
        return !!this.src.default;
    }
    _compileIsType(comp: JitCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileIsType(comp);
        } else {
            const itemCode = this.getMemberType().compileIsType(comp);
            return this.isOptional() ? `${comp.getChildVλl()} === undefined || (${itemCode})` : itemCode;
        }
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileTypeErrors(comp);
        } else {
            const itemCode = this.getMemberType().compileTypeErrors(comp);
            return this.isOptional() ? `if (${comp.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(comp);
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child);
        return isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        return isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileJsonStringify(comp);
        } else {
            const argCode = this.getMemberType().compileJsonStringify(comp);
            const isFirst = this.getChildIndex() === 0;
            const sep = isFirst ? '' : `','+`;
            if (this.isOptional()) return `(${comp.getChildVλl()} === undefined ? '': ${sep}${argCode})`;
            return `${sep}${argCode}`;
        }
    }
    _compileHasUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeyErrors(): string {
        return '';
    }
    _compileStripUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeysToUndefined(): string {
        return '';
    }
    _mock(ctx: MockOperation): any {
        return this.getMemberType().mock(ctx);
    }
}
