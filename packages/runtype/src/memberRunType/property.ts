/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {JitOperation, JitPathItem, MockContext, JitTypeErrorOperation} from '../types';
import {memo, toLiteral} from '../utils';
import {validPropertyNameRegExp} from '../constants';
import {SingleItemMemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';

export class PropertyRunType extends SingleItemMemberRunType<TypePropertySignature | TypeProperty> {
    src: TypePropertySignature | TypeProperty = null as any; // will be set after construction
    getName() {
        return 'property';
    }
    isOptional(): boolean {
        return !!this.src.optional;
    }
    useArrayAccessor() {
        return !this.isSafePropName();
    }
    getMemberName(): string | number {
        return typeof this.src.name === 'symbol' ? this.src.name.toString() : this.src.name;
    }
    isSafePropName = memo(() => {
        return (
            (typeof this.src.name === 'string' && validPropertyNameRegExp.test(this.src.name)) ||
            typeof this.src.name === 'number'
        );
    });
    protected hasReturnCompileIsType(): boolean {
        return false;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return false;
    }
    protected _compileIsType(op: JitOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => {
            const childVarName = nextOp.args.vλl;
            const itemCode = child.compileIsType(nextOp);
            return this.src.optional ? `(${childVarName} === undefined || ${itemCode})` : itemCode;
        };
        return this.compileChildren(compNext, op, childPath);
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitTypeErrorOperation) => {
            const childVarName = nextOp.args.vλl;
            const itemCode = child.compileTypeErrors(nextOp);
            return this.src.optional ? `if (${childVarName} !== undefined) {${itemCode}}` : itemCode;
        };
        return this.compileChildren(compNext, op, childPath);
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => {
            const childVarName = nextOp.args.vλl;
            const propCode = child.compileJsonEncode(nextOp);
            if (this.src.optional) return `if (${childVarName} !== undefined) ${propCode}`;
            return propCode;
        };
        return this.compileChildren(compNext, op, childPath);
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => {
            const propCode = child.compileJsonDecode(nextOp);
            if (this.src.optional) return `if (${nextOp.args.vλl} !== undefined) ${propCode}`;
            return propCode;
        };
        return this.compileChildren(compNext, op, childPath);
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        const childPath: JitPathItem = this.getMemberPathItem();
        const compNext = (nextOp: JitOperation) => {
            const childVarName = nextOp.args.vλl;
            // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
            const proNameJSon = this.isSafePropName()
                ? `'${toLiteral(this.getMemberIndex())}'`
                : jitUtils.asJSONString(toLiteral(this.getMemberIndex()));
            const propCode = child.compileJsonStringify(nextOp);
            // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
            const isFirst = this.getMemberIndex() === 0;
            const sep = isFirst ? '' : `','+`;
            if (this.src.optional) {
                return `(${childVarName} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
            }
            return `${sep}${proNameJSon}+':'+${propCode}`;
        };
        return this.compileChildren(compNext, op, childPath);
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.getMemberName()] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
    getMemberPathItem = memo((): JitPathItem => {
        return {vλl: this.getMemberName(), useArrayAccessor: !this.isSafePropName(), literal: toLiteral(this.getMemberName())};
    });
}
