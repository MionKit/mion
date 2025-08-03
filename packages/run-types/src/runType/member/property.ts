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
    // PropertyRunType handles symbol properties by skipping certain operations
    // #### jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!itemCode) return undefined;
        return {
            code: this.src.optional ? `(${comp.getChildVλl()} === undefined || ${itemCode.code})` : itemCode.code,
            codeType: 'E',
            skipJit: false,
            children: [itemCode]
        };
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!itemCode) return undefined;
        return {
            code: this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${itemCode.code}}` : itemCode.code,
            codeType: 'S',
            skipJit: false,
            children: [itemCode]
        };
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        return {
            code: this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${code}}` : code,
            codeType: 'S',
            skipJit: false,
            children: [childCode]
        };
    }
}
