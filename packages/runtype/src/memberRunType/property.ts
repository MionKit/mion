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
        const itemCode = child.compileIsType(op);
        return this.src.optional ? `(${op.args.vλl} === undefined || ${itemCode})` : itemCode;
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileTypeErrors(op);
        return this.src.optional ? `if (${op.args.vλl} !== undefined) {${itemCode}}` : itemCode;
    }
    protected _compileJsonEncode(op: JitOperation): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const propCode = child.compileJsonEncode(op);
        if (this.src.optional) return `if (${op.args.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    protected _compileJsonDecode(op: JitOperation): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const propCode = child.compileJsonDecode(op);
        if (this.src.optional) return `if (${op.args.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        const child = this.getJitChild();
        if (!child) return '';
        // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
        const proNameJSon = this.isSafePropName()
            ? `'${toLiteral(this.getMemberIndex())}'`
            : jitUtils.asJSONString(toLiteral(this.getMemberIndex()));
        const propCode = child.compileJsonStringify(op);
        // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
        const isFirst = this.getMemberIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.src.optional) {
            return `(${op.args.vλl} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
        }
        return `${sep}${proNameJSon}+':'+${propCode}`;
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.getMemberName()] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
    getPathItem = memo((): JitPathItem => {
        return {vλl: this.getMemberName(), useArrayAccessor: !this.isSafePropName(), literal: toLiteral(this.getMemberName())};
    });
}
