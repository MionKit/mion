/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {jitCode} from '../../types';
import {childIsExpression, getPropLiteral, getPropVarName, useArrayAccessorForProp} from '../../lib/utils';
import {MemberRunType} from '../../lib/baseRunTypes';
import {InterfaceRunType} from '../collection/interface';
import {JitFunctions} from '../../constants.functions';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    isUnionDiscriminator = false;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitCompiler) {
        return getPropVarName(this.src.name);
    }
    getChildLiteral(comp: JitCompiler) {
        return getPropLiteral(this.getChildVarName(comp));
    }
    useArrayAccessor() {
        return useArrayAccessorForProp(this.src.name);
    }
    getJitChildIndex = (comp: JitCompiler) => (this.getParent() as InterfaceRunType).getJitChildren(comp).indexOf(this);
    isOptional = () => !!this.src.optional;
    skipJit(comp: JitCompiler): boolean {
        const name = (this.src as TypeProperty).name;
        if (typeof name === 'symbol') {
            return comp?.fnID !== JitFunctions.toCode.id;
        }
        return false;
    }
    // #### jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!itemCode) return undefined;
        return this.src.optional ? `(${comp.getChildVλl()} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!itemCode) return undefined;
        return this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
}
