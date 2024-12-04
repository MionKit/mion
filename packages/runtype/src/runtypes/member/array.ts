/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Type, TypeArray} from '../../lib/_deepkit/src/reflection/type';
import type {JitFnID, MockOperation} from '../../types';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {random} from '../../lib/mock';
import {MemberRunType} from '../../lib/baseRunTypes';
import {childIsExpression} from '../../lib/utils';
import {JitFnIDs} from '../../constants';

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
    jitFnHasReturn(fnId: JitFnID): boolean {
        switch (fnId) {
            case JitFnIDs.isType:
            case JitFnIDs.jsonStringify:
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }

    // #### jit code ####
    _compileIsType(comp: JitCompiler): string {
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
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        const memberCode = this.getJitChild()?.compileTypeErrors(comp);
        if (!memberCode) return `if (!Array.isArray(${varName})) ${comp.callJitErr(this)};`;
        return `
            if (!Array.isArray(${varName})) ${comp.callJitErr(this)};
            else {for (let ${index} = ${this.startIndex()}; ${index} < ${varName}.length; ${index}++) {${memberCode}}}
        `;
    }
    _compileJsonEncode(comp: JitCompiler) {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonEncodeChild();
        const childCode = child?.compileJsonEncode(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonDecode(comp: JitCompiler) {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonDecodeChild();
        const childCode = child?.compileJsonDecode(comp);
        if (!childCode || !child) return undefined;
        const isExpression = childIsExpression(JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const varName = comp.vλl;
        const memberCode = this.getJitChild()?.compileJsonStringify(comp);
        if (!memberCode) return `JSON.stringify(${varName})`;
        const jsonItems = `ls${this.getNestLevel()}`;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        return `
            const ${jsonItems} = [];
            for (let ${index} = ${this.startIndex()}; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }
    _compileHasUnknownKeys(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return undefined;
        const memberCode = this.getJitChild()?.compileHasUnknownKeys(comp);
        if (!memberCode) return undefined;
        const varName = comp.vλl;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();

        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = ${this.startIndex()}; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (${resultVal}) return true;
            }
            return false;
        `;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler) {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler) {
        if (this.getMemberType().getFamily() === 'A') return '';
        const memberCode = this.getJitChild()?.compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }

    traverseCode(comp: JitCompiler, memberCode: string | undefined): string | undefined {
        if (!memberCode) return undefined;
        const index = this.getChildVarName();
        return `for (let ${index} = ${this.startIndex()}; ${index} < ${comp.vλl}.length; ${index}++) {${memberCode}}`;
    }

    _mock(ctx: MockOperation): any[] {
        const length = ctx.arrayLength ?? random(0, ctx.maxRandomItemsLength);
        return Array.from({length}, () => this.getMemberType().mock(ctx));
    }
}
