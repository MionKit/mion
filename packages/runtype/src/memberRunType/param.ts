/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeParameter} from '../_deepkit/src/reflection/type';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
import {memo} from '../utils';
import {RestParamsRunType} from './restParams';

export class ParameterRunType extends SingleItemMemberRunType<TypeParameter> {
    src: TypeParameter = null as any; // will be set after construction
    getName() {
        return 'property';
    }
    isOptional(): boolean {
        return !!this.src.optional || this.isRest();
    }
    useArrayAccessor() {
        return true;
    }
    getMemberName(): string | number {
        return this.src.name;
    }
    isRest(): boolean {
        return this.getMemberType() instanceof RestParamsRunType;
    }
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return false;
    }
    protected _compileIsType(op: JitOperation): string {
        if (this.isRest()) {
            return this.getMemberType().compileIsType(op);
        } else {
            const varName = op.args.vλl;
            const itemCode = this.getMemberType().compileIsType(op);
            return this.isOptional() ? `${varName} === undefined || (${itemCode})` : itemCode;
        }
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        if (this.isRest()) {
            return this.getMemberType().compileTypeErrors(op);
        } else {
            const varName = op.args.vλl;
            const itemCode = this.getMemberType().compileTypeErrors(op);
            return this.isOptional() ? `if (${varName} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    protected _compileJsonEncode(op: JitOperation): string {
        return this.getMemberType().compileJsonEncode(op);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        return this.getMemberType().compileJsonDecode(op);
    }
    protected _compileJsonStringify(op: JitOperation): string {
        if (this.isRest()) {
            return this.getMemberType().compileJsonStringify(op);
        } else {
            const argCode = this.getMemberType().compileJsonStringify(op);
            const isFirst = this.getMemberIndex() === 0;
            const sep = isFirst ? '' : `','+`;
            if (this.isOptional()) return `(${op.args.vλl} === undefined ? '': ${sep}${argCode})`;
            return `${sep}${argCode}`;
        }
    }
    mock(ctx?: MockContext): any {
        return this.getMemberType().mock(ctx);
    }
    getPathItem = memo((): JitPathItem => {
        return {vλl: this.getMemberIndex(), useArrayAccessor: true, literal: this.getMemberIndex()};
    });
}
