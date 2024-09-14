/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';

export class TupleMemberRunType extends SingleItemMemberRunType<TypeTupleMember> {
    src: TypeTupleMember = null as any; // will be set after construction
    getName() {
        return 'string';
    }
    getMemberName() {
        return 'tupleMember';
    }
    useArrayAccessor() {
        return true;
    }
    isOptional(): boolean {
        return !!this.src.optional;
    }
    getMemberIndex(): number {
        return this.src.parent.types.indexOf(this.src);
    }
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return false;
    }
    protected _compileIsType(op: JitOperation): string {
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileIsType(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return this.src.optional ? `(${op.args.vλl} === undefined || ${itemCode})` : itemCode;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitTypeErrorOperation) => this.getMemberType().compileTypeErrors(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return this.src.optional ? `if (${op.args.vλl} !== undefined) {${itemCode}}` : itemCode;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileJsonEncode(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return this.src.optional ? `${op.args.vλl} === undefined ? null : ${itemCode}` : itemCode;
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileJsonDecode(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return this.src.optional ? `${op.args.vλl} === null ? undefined : ${itemCode}` : itemCode;
    }
    protected _compileJsonStringify(stack: JitOperation): string {
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileJsonStringify(nextOp);
        const itemCode = this.compileChildren(compNext, stack, childPath);
        return this.src.optional ? `(${stack.args.vλl} === undefined ? null : ${itemCode})` : itemCode;
    }
    mock(stack?: Pick<MockContext, 'optionalProbability'>): any {
        if (this.src.optional) {
            const probability = stack?.optionalProbability || 0.5;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (Math.random() < probability) {
                return undefined;
            }
        }
        return this.getMemberType().mock(stack);
    }
    getMemberPathItem(): JitPathItem {
        const index = this.getMemberIndex();
        return {vλl: index, useArrayAccessor: true, literal: index};
    }
}
