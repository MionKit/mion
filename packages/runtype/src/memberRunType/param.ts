/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKind, type TypeParameter} from '../_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {MemberRunType} from '../baseRunTypes';
import {MockContext} from '../types';
import {JitFnIDs} from '../constants';
import {childIsExpression, getParamIndex} from '../utils';

export class ParameterRunType extends MemberRunType<TypeParameter> {
    src: TypeParameter = null as any; // will be set after construction
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
    _compileIsType(cop: JitCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileIsType(cop);
        } else {
            const itemCode = this.getMemberType().compileIsType(cop);
            return this.isOptional() ? `${cop.getChildVλl()} === undefined || (${itemCode})` : itemCode;
        }
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileTypeErrors(cop);
        } else {
            const itemCode = this.getMemberType().compileTypeErrors(cop);
            return this.isOptional() ? `if (${cop.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonEncode, child);
        return isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonDecode, child);
        return isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        if (this.isRest()) {
            return this.getMemberType().compileJsonStringify(cop);
        } else {
            const argCode = this.getMemberType().compileJsonStringify(cop);
            const isFirst = this.getChildIndex() === 0;
            const sep = isFirst ? '' : `','+`;
            if (this.isOptional()) return `(${cop.getChildVλl()} === undefined ? '': ${sep}${argCode})`;
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

    mock(ctx?: MockContext): any {
        return this.getMemberType().mock(ctx);
    }
}
