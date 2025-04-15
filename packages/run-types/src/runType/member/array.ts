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
import {CodeType, JitFunctions} from '../../constants';

export class ArrayRunType<T extends Type = TypeArray> extends MemberRunType<T> {
    isJitInlined = () => false;
    getChildVarName(): string {
        return `i${this.getNestLevel()}`;
    }
    startIndex(): number {
        return 0;
    }
    getChildLiteral(): string {
        return this.getChildVarName();
    }
    useArrayAccessor(): true {
        return true;
    }
    isOptional(): boolean {
        return false;
    }
    getCodeType(fnId: JitFnID): CodeType {
        switch (fnId) {
            case JitFunctions.isType.id:
            case JitFunctions.jsonStringify.id:
            case JitFunctions.hasUnknownKeys.id:
                return 'RB';
            default:
                return super.getCodeType(fnId);
        }
    }
    // #### jit code ####
    _compileIsType(comp: JitCompiler): jitCode {
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        const memberCode = this.getJitChild()?.compileIsType(comp);
        if (!memberCode) return `Array.isArray(${comp.vλl})`;
        return `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): jitCode {
        const index = this.getChildVarName();
        const memberCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!memberCode) return `if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};`;
        return `
            if (!Array.isArray(${comp.vλl})) ${comp.callJitErr(this)};
            else {for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode}}}
        `;
    }
    _compileToJsonVal(comp: JitCompiler): jitCode {
        const index = this.getChildVarName();
        const child = this.getJitChild();
        const childCode = child?.compileToJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.toJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`;
    }
    _compileFromJsonVal(comp: JitCompiler): jitCode {
        const index = this.getChildVarName();
        const child = this.getJitChild();
        const childCode = child?.compileFromJsonVal(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFunctions.fromJsonVal.id, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {${code}}`;
    }
    _compileHasUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!memberCode) return undefined;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();

        return `
            if (!Array.isArray(${comp.vλl})) return false;
            for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (${resultVal}) return true;
            }
            return false;
        `;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): jitCode {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }

    traverseCode(comp: JitCompiler, memberCode: jitCode): jitCode {
        if (!memberCode) return undefined;
        const index = this.getChildVarName();
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode}}`;
    }
}
