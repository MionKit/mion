/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '../../_deepkit/src/reflection/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {JitConstants, MockOperation, Mutable} from '../../types';
import {
    childIsExpression,
    getPropIndex,
    getPropLiteral,
    getPropVarName,
    isSafePropName,
    memorize,
    useArrayAccessorForProp,
} from '../../lib/utils';
import {BaseRunType, MemberRunType} from '../../baseRunTypes';
import {jitUtils} from '../../lib/jitUtils';
import {InterfaceRunType} from '../collection/interface';
import {JitFnIDs} from '../../constants';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    src: TypePropertySignature | TypeProperty = null as any; // will be set after construction
    getChildIndex = memorize(() => getPropIndex(this.src));
    getChildVarName = memorize(() => getPropVarName(this.src.name));
    getChildLiteral = memorize(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memorize(() => useArrayAccessorForProp(this.src.name));
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

    _compileIsType(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileIsType(comp);
        return this.src.optional ? `(${comp.getChildVλl()} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const itemCode = child.compileTypeErrors(comp);
        return this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const child = this.getJitChild();
        if (!child) return '';
        const propCode = child.compileJsonStringify(comp);
        // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
        const sep = this.skipCommas ? '' : '+","';
        // encoding safe property with ':' inside the string saves a little processing
        // when prop is not safe we need to double encode double quotes and escape characters
        const propDef = isSafePropName(this.src.name)
            ? `'"${this.getChildVarName()}":'`
            : `${jitUtils.asJSONString(this.getChildLiteral())}+':'`;
        if (this.src.optional) {
            this.tempChildVλl = comp.getChildVλl();
            // TODO: check if json for an object with first property undefined is valid (maybe the comma must be dynamic too)
            return `(${this.tempChildVλl} === undefined ? '' : ${propDef}+${propCode}${sep})`;
        }
        return `${propDef}+${propCode}${sep}`;
    }
    _mock(ctx: Pick<MockOperation, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx.optionalPropertyProbability?.[this.getChildVarName()] ?? ctx.optionalProbability;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() > probability) return undefined;
        return this.getMemberType().mock(ctx);
    }
}
