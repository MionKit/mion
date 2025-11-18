/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {TypeProperty, TypePropertySignature} from '@deepkit/type';
import type {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import type {JitCode} from '../../types';
import {childIsExpression, getPropLiteral, getPropVarName, useArrayAccessorForProp} from '../../lib/utils';
import {MemberRunType} from '../../lib/baseRunTypes';
import {InterfaceRunType} from '../collection/interface';
import {JitFunctions} from '../../constants.functions';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    isUnionDiscriminator = false;
    /** this is set by the parent interface if prop is optional, when optional properties are sorted */
    optionalIndex = -1;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getPropertyName() {
        return getPropVarName(this.src.name);
    }
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getChildVarName(comp: JitFnCompiler) {
        return getPropVarName(this.src.name);
    }
    getChildLiteral(comp: JitFnCompiler) {
        return getPropLiteral(this.getChildVarName(comp));
    }
    useArrayAccessor() {
        return useArrayAccessorForProp(this.src.name);
    }
    getJitChildIndex = (comp: JitFnCompiler) => (this.getParent() as InterfaceRunType).getJitChildren(comp).indexOf(this);
    isOptional = () => !!this.src.optional;
    skipJit(comp: JitFnCompiler): boolean {
        const name = (this.src as TypeProperty).name;
        if (typeof name === 'symbol') {
            return comp?.fnID !== JitFunctions.toJavascript.id;
        }
        return false;
    }
    // #### jit code ####

    emitIsType(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileIsType(child, 'E');
        if (!childJit?.code) return {code: undefined, type: 'E'};
        return this.src.optional ? {code: `(${comp.getChildVλl()} === undefined || ${childJit.code})`, type: 'E'} : childJit;
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileTypeErrors(child, 'S');
        if (!childJit?.code) return {code: undefined, type: 'S'};
        return this.src.optional ? {code: `if (${comp.getChildVλl()} !== undefined) {${childJit.code}}`, type: 'S'} : childJit;
    }
    emitPrepareForJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compilePrepareForJson(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        if (this.src.optional) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
    emitRestoreFromJson(comp: JitFnCompiler): JitCode {
        const child = this.getJitChild(comp);
        const childJit = comp.compileRestoreFromJson(child, 'S');
        if (!child || !childJit?.code) return {code: undefined, type: 'S'};
        const isExpression = childIsExpression(childJit, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childJit.code};` : childJit.code || '';
        if (this.src.optional) return {code: `if (${comp.getChildVλl()} !== undefined) {${code}}`, type: 'S'};
        return {code, type: 'S'};
    }
}
