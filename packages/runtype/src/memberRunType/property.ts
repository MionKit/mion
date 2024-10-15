/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {MockContext, StackItem} from '../types';
import {getPropIndex, getPropLiteral, getPropVarName, isSafePropName, memo, toLiteral, useArrayAccessorForProp} from '../utils';
import {MemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    src: TypePropertySignature | TypeProperty = null as any; // will be set after construction
    getName() {
        return 'property';
    }
    getChildIndex = memo(() => getPropIndex(this.src));
    getChildVarName = memo(() => getPropVarName(this.src.name));
    getChildLiteral = memo(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memo(() => useArrayAccessorForProp(this.src.name));
    isOptional = () => !!this.src.optional;

    // #### jit code ####

    _compileIsType(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileIsType(cop);
        const childItem = cop.popItem as StackItem;
        return this.src.optional ? `(${childItem.vλl} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileTypeErrors(cop);
        const childItem = cop.popItem as StackItem;
        return this.src.optional ? `if (${childItem.vλl} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const propCode = child.compileJsonEncode(cop);
        const childItem = cop.popItem as StackItem;
        if (this.src.optional) return `if (${childItem.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const propCode = child.compileJsonDecode(cop);
        const childItem = cop.popItem as StackItem;
        if (this.src.optional) return `if (${childItem.vλl} !== undefined) ${propCode}`;
        return propCode;
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        const child = this.getJitChild();
        if (!child) return '';
        // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
        const proNameJSon = isSafePropName(this.src.name)
            ? `'${toLiteral(this.getChildIndex())}'`
            : jitUtils.asJSONString(toLiteral(this.getChildIndex()));
        const propCode = child.compileJsonStringify(cop);
        // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
        const isFirst = this.getChildIndex() === 0;
        const sep = isFirst ? '' : `','+`;
        if (this.src.optional) {
            const childItem = cop.popItem as StackItem;
            return `(${childItem.vλl} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
        }
        return `${sep}${proNameJSon}+':'+${propCode}`;
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.getChildVarName()] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
}
