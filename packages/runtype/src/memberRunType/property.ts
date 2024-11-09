/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {JitConstants, MockContext, Mutable} from '../types';
import {
    getPropIndex,
    getPropLiteral,
    getPropVarName,
    isLastStringifyChildren,
    isSafePropName,
    memo,
    useArrayAccessorForProp,
} from '../utils';
import {BaseRunType, MemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {InterfaceRunType} from '../collectionRunType/interface';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    src: TypePropertySignature | TypeProperty = null as any; // will be set after construction
    getChildIndex = memo(() => getPropIndex(this.src));
    getChildVarName = memo(() => getPropVarName(this.src.name));
    getChildLiteral = memo(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memo(() => useArrayAccessorForProp(this.src.name));
    getJitChildIndex = () => (this.getParent() as InterfaceRunType).getJitChildren().indexOf(this);
    isOptional = () => !!this.src.optional;
    getJitConstants(stack: BaseRunType[] = []): JitConstants {
        const jc = super.getJitConstants(stack) as Mutable<JitConstants>;
        const name = (this.src as TypeProperty).name;
        if (typeof name === 'symbol') {
            jc.skipJit = true;
            jc.skipJsonEncode = true;
            jc.skipJsonDecode = true;
        }
        return jc;
    }

    // #### jit code ####

    _compileIsType(cop: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileIsType(cop);
        return this.src.optional ? `(${cop.getChildVλl()} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileTypeErrors(cop);
        return this.src.optional ? `if (${cop.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const propCode = child.compileJsonEncode(cop);
        if (this.src.optional) return `if (${cop.getChildVλl()} !== undefined) {${propCode}}`;
        return propCode;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const propCode = child.compileJsonDecode(cop);
        if (this.src.optional) return `if (${cop.getChildVλl()} !== undefined) {${propCode}}`;
        return propCode;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const propCode = child.compileJsonStringify(cop);
        // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
        const isLast = isLastStringifyChildren(this);
        const sep = isLast ? '' : '+","';
        // encoding safe property with ':' inside the string saves a little processing
        // when prop is not safe we need to double encode double quotes and escape characters
        const propDef = isSafePropName(this.src.name)
            ? `'"${this.getChildVarName()}":'`
            : `${jitUtils.asJSONString(this.getChildLiteral())}+':'`;
        if (this.src.optional) {
            // TODO: check if json for an object with first property undefined is valid (maybe the comma must be dynamic too)
            return `(${cop.getChildVλl()} === undefined ? '' : ${propDef}+${propCode}${sep})`;
        }
        return `${propDef}+${propCode}${sep}`;
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.getChildVarName()] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
}
