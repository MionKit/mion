/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {PathItem, MockContext} from '../types';
import {toLiteral} from '../utils';
import {validPropertyNameRegExp} from '../constants';
import {MemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {JitCompileOp, JitCompileOperation, JitTypeErrorCompileOp} from '../jitOperation';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    src: TypePropertySignature | TypeProperty = null as any; // will be set after construction
    getName() {
        return 'property';
    }
    isOptional(): boolean {
        return !!this.src.optional;
    }
    getMemberName(): string | number {
        return typeof this.src.name === 'symbol' ? this.src.name.toString() : this.src.name;
    }
    isSafePropName() {
        return (
            (typeof this.src.name === 'string' && validPropertyNameRegExp.test(this.src.name)) ||
            typeof this.src.name === 'number'
        );
    }
    getJitChildrenPath(cop: JitCompileOperation): PathItem {
        const useArrayAccessor = !this.isSafePropName();
        const varName = this.getMemberName();
        const literal = toLiteral(varName);
        return cop.newPathItem(varName, literal, useArrayAccessor);
    }
    protected _compileIsType(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileIsType(cop);
        return this.src.optional ? `(${cop.vλl} === undefined || ${itemCode})` : itemCode;
    }
    protected _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileTypeErrors(cop);
        return this.src.optional ? `if (${cop.vλl} !== undefined) {${itemCode}}` : itemCode;
    }
    protected _compileJsonEncode(cop: JitCompileOp): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const propCode = child.compileJsonEncode(cop);
        if (this.src.optional) return `if (${cop.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    protected _compileJsonDecode(cop: JitCompileOp): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const propCode = child.compileJsonDecode(cop);
        if (this.src.optional) return `if (${cop.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    protected _compileJsonStringify(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
        const proNameJSon = this.isSafePropName()
            ? `'${toLiteral(this.getMemberIndex())}'`
            : jitUtils.asJSONString(toLiteral(this.getMemberIndex()));
        const propCode = child.compileJsonStringify(cop);
        // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
        const isFirst = this.getMemberIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.src.optional) {
            return `(${cop.vλl} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
        }
        return `${sep}${proNameJSon}+':'+${propCode}`;
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.getMemberName()] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
}
