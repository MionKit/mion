/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '@deepkit/type';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import type {jitCode, JitFnID} from '../../types';
import {childIsExpression, getPropLiteral, getPropVarName, useArrayAccessorForProp} from '../../lib/utils';
import {MemberRunType} from '../../lib/baseRunTypes';
import {InterfaceRunType} from '../collection/interface';
import {type CodeType, JitFunctions} from '../../constants.functions';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    isUnionDiscriminator = false;
    /** this is set by the parent interface if prop is optional, when optional properties are sorted */
    optionalIndex = -1;
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.fromBinary.id:
                return 'E';
            default:
                return super.getCodeType(fnID);
        }
    }
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
            return comp?.fnID !== JitFunctions.toJavascript.id;
        }
        return false;
    }
    // #### jit code ####

    _compileIsType(comp: JitCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!itemCode?.code) return {code: undefined, type: 'E'};
        return this.src.optional ? {code: `(${comp.getChildVλl()} === undefined || ${itemCode.code})`, type: 'E'} : itemCode;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const itemCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!itemCode?.code) return {code: undefined, type: 'S'};
        return this.src.optional ? {code: `if (${comp.getChildVλl()} !== undefined) {${itemCode.code}}`, type: 'S'} : itemCode;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!child || !childCode?.code) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        if (this.src.optional) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!child || !childCode?.code) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode.code};` : childCode.code;
        if (this.src.optional) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
}
