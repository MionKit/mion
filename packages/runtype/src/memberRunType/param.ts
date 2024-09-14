/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeParameter} from '../_deepkit/src/reflection/type';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
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
            const childPath: JitPathItem = this.getMemberPathItem();
            const compNext = (nextOp: JitOperation) => this.getMemberType().compileIsType(nextOp);
            const itemCode = this.compileChildren(compNext, op, childPath);
            return this.isOptional() ? `${varName} === undefined || (${itemCode})` : itemCode;
        }
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        if (this.isRest()) {
            return this.getMemberType().compileTypeErrors(op);
        } else {
            const varName = op.args.vλl;
            const childPath: JitPathItem = this.getMemberPathItem();
            const compNext = (nextOp: JitTypeErrorOperation) => this.getMemberType().compileTypeErrors(nextOp);
            const itemCode = this.compileChildren(compNext, op, childPath);
            return this.isOptional() ? `if (${varName} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    protected _compileJsonEncode(op: JitOperation): string {
        return this.compileJsonDE(op, true);
    }
    protected _compileJsonDecode(stack: JitOperation): string {
        return this.compileJsonDE(stack, false);
    }
    private compileJsonDE(op: JitOperation, isEncode = false): string {
        const compileFn = isEncode ? this.getMemberType().compileJsonEncode : this.getMemberType().compileJsonDecode;
        if (this.isRest()) {
            return compileFn(op);
        } else {
            const childPath: JitPathItem = this.getMemberPathItem();
            return this.compileChildren((nextOp: JitOperation) => compileFn(nextOp), op, childPath);
        }
    }
    protected _compileJsonStringify(op: JitOperation): string {
        if (this.isRest()) {
            return this.getMemberType().compileJsonStringify(op);
        } else {
            const childPath: JitPathItem = this.getMemberPathItem();
            const compNext = (nextOp: JitOperation) => {
                const childVarName = nextOp.args.vλl;
                const argCode = this.getMemberType().compileJsonStringify(nextOp);
                const isFirst = this.getMemberIndex() === 0;
                const sep = isFirst ? '' : `','+`;
                if (this.isOptional()) return `(${childVarName} === undefined ? '': ${sep}${argCode})`;
                return `${sep}${argCode}`;
            };
            return this.compileChildren(compNext, op, childPath);
        }
    }
    mock(ctx?: MockContext): any {
        return this.getMemberType().mock(ctx);
    }
    getMemberPathItem(): JitPathItem {
        return {vλl: this.getMemberIndex(), useArrayAccessor: true, literal: this.getMemberIndex()};
    }
}
