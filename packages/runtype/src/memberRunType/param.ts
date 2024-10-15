/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeParameter} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {MockContext} from '../types';
import {RestParamsRunType} from './restParams';

export class ParameterRunType extends MemberRunType<TypeParameter> {
    src: TypeParameter = null as any; // will be set after construction
    getName() {
        return 'property';
    }
    isOptional(): boolean {
        return !!this.src.optional || this.isRest();
    }
    getChildVarName(): number {
        return this.getChildIndex();
    }
    getChildLiteral(): number {
        throw this.getChildIndex();
    }
    useArrayAccessor(): true {
        return true;
    }
    isRest(): boolean {
        return this.getMemberType() instanceof RestParamsRunType;
    }
    _compileIsType(cop: JitCompileOp): string {
        if (this.isRest()) {
            return this.getMemberType().compileIsType(cop);
        } else {
            const varName = cop.vλl;
            const itemCode = this.getMemberType().compileIsType(cop);
            return this.isOptional() ? `${varName} === undefined || (${itemCode})` : itemCode;
        }
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        if (this.isRest()) {
            return this.getMemberType().compileTypeErrors(cop);
        } else {
            const varName = cop.vλl;
            const itemCode = this.getMemberType().compileTypeErrors(cop);
            return this.isOptional() ? `if (${varName} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        return this.getMemberType().compileJsonEncode(cop);
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        return this.getMemberType().compileJsonDecode(cop);
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        if (this.isRest()) {
            return this.getMemberType().compileJsonStringify(cop);
        } else {
            const argCode = this.getMemberType().compileJsonStringify(cop);
            const isFirst = this.getChildIndex() === 0;
            const sep = isFirst ? '' : `','+`;
            if (this.isOptional()) return `(${cop.vλl} === undefined ? '': ${sep}${argCode})`;
            return `${sep}${argCode}`;
        }
    }
    mock(ctx?: MockContext): any {
        return this.getMemberType().mock(ctx);
    }
}
