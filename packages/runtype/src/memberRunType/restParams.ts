import {TypeRest} from '../_deepkit/src/reflection/type';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';

/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export class RestParamsRunType extends SingleItemMemberRunType<TypeRest> {
    src: TypeRest = null as any; // will be set after construction
    getName() {
        return 'restParams';
    }
    isOptional() {
        return true;
    }
    useArrayAccessor() {
        return true;
    }
    getMemberName() {
        return '...';
    }
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }
    protected _compileIsType(op: JitOperation): string {
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const indexName = childPath.vλl;
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileIsType(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return `(function() {
            for (let ${indexName} = ${this.getMemberIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {
                if (!(${itemCode})) return false;
            }
            return true;
        })()`;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const indexName = childPath.vλl;
        const compNext = (nextOp: JitTypeErrorOperation) => this.getMemberType().compileTypeErrors(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return `for (let ${indexName} = ${this.getMemberIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        return this.compileJsonDE(op, true);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        return this.compileJsonDE(op, false);
    }
    private compileJsonDE(op: JitOperation, isEncode = false): string {
        const compileFn = isEncode ? this.getMemberType().compileJsonEncode : this.getMemberType().compileJsonDecode;
        const varName = op.args.vλl;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const indexName = childPath.vλl;
        const compNext = (nextOp: JitOperation) => compileFn(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return `for (let ${indexName} = ${this.getMemberIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {${itemCode}}`;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const varName = op.args.vλl;
        const arrName = `rεsultλrr${op.stack.length}`;
        const itemName = `itεm${op.stack.length}`;
        const childPath: JitPathItem = this.getMemberPathItem(op);
        const indexName = childPath.vλl;
        const isFist = this.getMemberIndex() === 0;
        const sep = isFist ? '' : `','+`;
        const compNext = (nextOp: JitOperation) => this.getMemberType().compileJsonStringify(nextOp);
        const itemCode = this.compileChildren(compNext, op, childPath);
        return `(function(){
            const ${arrName} = [];
            for (let ${indexName} = ${this.getMemberIndex()}; ${indexName} < ${varName}.length; ${indexName}++) {
                const ${itemName} = ${itemCode};
                if(${itemName}) ${arrName}.push(${itemName});
            }
            if (!${arrName}.length) {return '';}
            else {return ${sep}${arrName}.join(',')}
        })()`;
    }
    mock(ctx?: MockContext): string {
        return this.getMemberType().mock(ctx);
    }
    getMemberPathItem(op: JitOperation): JitPathItem {
        const indexName = `iε${op.stack.length}`;
        return {vλl: indexName, useArrayAccessor: true, literal: indexName};
    }
}
