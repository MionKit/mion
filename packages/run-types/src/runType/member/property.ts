/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {JitConfig, Mutable, jitCode} from '../../types';
import {childIsExpression, getPropLiteral, getPropVarName, memorize, useArrayAccessorForProp} from '../../lib/utils';
import {BaseRunType, MemberRunType} from '../../lib/baseRunTypes';
import {InterfaceRunType} from '../collection/interface';
import {JitFunctions} from '../../constants';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    getChildVarName = memorize(() => getPropVarName(this.src.name));
    getChildLiteral = memorize(() => getPropLiteral(this.getChildVarName()));
    useArrayAccessor = memorize(() => useArrayAccessorForProp(this.src.name));
    getJitChildIndex = () => (this.getParent() as InterfaceRunType).getJitChildren().indexOf(this);
    isOptional = () => !!this.src.optional;
    getJitConfig(stack: BaseRunType[] = []): JitConfig {
        const jc = super.getJitConfig(stack) as Mutable<JitConfig>;
        const name = (this.src as TypeProperty).name;
        if (typeof name === 'symbol') {
            jc.skipJit = true;
        }
        return jc;
    }

    // #### jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const itemCode = this.getJitChild()?.compileIsType(comp);
        if (!itemCode) return undefined;
        return this.src.optional ? `(${comp.getChildVλl()} === undefined || ${itemCode})` : itemCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const itemCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!itemCode) return undefined;
        return this.src.optional ? `if (${comp.getChildVλl()} !== undefined) {${itemCode}}` : itemCode;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild();
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild();
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        if (this.src.optional) return `if (${comp.getChildVλl()} !== undefined) {${code}}`;
        return code;
    }
}
