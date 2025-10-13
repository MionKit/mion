/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeArray} from '@deepkit/type';
import type {jitCode, JitFnID} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {MemberRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {CodeType} from '../../constants.functions';
import {JitFunctions} from '../../constants.functions';

export class ArrayRunType<T extends Type = TypeArray> extends MemberRunType<T> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    startIndex(comp: JitCompiler): number {
        return 0;
    }
    getChildVarName(comp: JitCompiler): string {
        return `i${comp.getNestLevel(this)}`;
    }
    getChildLiteral(comp: JitCompiler): string {
        return this.getChildVarName(comp);
    }
    useArrayAccessor(): true {
        return true;
    }
    isOptional(): boolean {
        return false;
    }
    getCodeType(fnID: JitFnID): CodeType {
        switch (fnID) {
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.hasUnknownKeys.id:
            case JitFunctions.toJavascript.id:
                return 'RB';
            default:
                return super.getCodeType(fnID);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);
        const memberCode = this.getJitChild(comp)?.compileIsType(comp);
        if (!memberCode) return `Array.isArray(${comp.vλl})`;
        return `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const memberCode = this.getJitChild(comp)?.compileTypeErrors(comp);
        if (!memberCode) return `if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};`;
        return `
            if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};
            else {for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode}}}
        `;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childCode = child?.compileToJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        const index = this.getChildVarName(comp);
        const child = this.getJitChild(comp);
        const childCode = child?.compileFromJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild(comp)?.compileHasUnknownKeys(comp);
        if (!memberCode) return undefined;
        const resultVal = `res${comp.getNestLevel(this)}`;
        const index = this.getChildVarName(comp);

        return `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (${resultVal}) return true;
            }
            return false;
        `;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild(comp)?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild(comp)?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        this.checkNonSkipTypes(comp);
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild(comp)?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }

    traverseCode(comp: JitCompiler, memberCode: jitCode): jitCode {
        if (!memberCode) return undefined;
        const index = this.getChildVarName(comp);
        return `for (let ${index} = ${this.startIndex(comp)}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode}}`;
    }

    checkNonSkipTypes(comp: JitCompiler) {
        const child = this.getMemberType();
        if (child.skipJit(comp)) throw new Error(`Arrays can not have non serializable types, ie: Symbol[], Function[], etc.`);
    }
}
