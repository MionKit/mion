/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../../lib/_deepkit/src/reflection/type';
import {JitFnID, MockOperation} from '../../types';
import {random} from '../../lib/mock';
import {MemberRunType} from '../../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../../lib/jitCompiler';
import {getJitErrorPath, getExpected, shouldSkipJit, childIsExpression} from '../../lib/utils';
import {JitFnIDs} from '../../constants';

export class ArrayRunType extends MemberRunType<TypeArray> {
    src: TypeArray = null as any; // will be set after construction
    isJitInlined = () => false;
    getChildVarName(): string {
        return `i${this.getNestLevel()}`;
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
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            case JitFnIDs.hasUnknownKeys:
                return true;
            default:
                return super.jitFnHasReturn(fnId);
        }
    }

    // #### jit code ####

    _compileIsType(comp: JitCompiler): string {
        const varName = comp.vλl;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) return `Array.isArray(${varName})`;
        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileIsType(comp)};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(comp: JitErrorsCompiler): string {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) {
            return `if (!Array.isArray(${varName})) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)});`;
        }
        return `
            if (!Array.isArray(${varName})) utl.err(${comp.args.εrr},${getJitErrorPath(comp)},${getExpected(this)});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.getMemberType().compileTypeErrors(comp)}
                }
            }
        `;
    }
    _compileJsonEncode(comp: JitCompiler): string {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonDecode(comp: JitCompiler): string {
        const varName = comp.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(comp);
        const isExpression = childIsExpression(comp, JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${comp.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonStringify(comp: JitCompiler): string {
        const varName = comp.vλl;
        const jsonItems = `ls${this.getNestLevel()}`;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) return `JSON.stringify(${varName})`;
        return `
            const ${jsonItems} = [];
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileJsonStringify(comp)};
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }
    _compileHasUnknownKeys(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileHasUnknownKeys(comp);
        if (!memberCode) return '';
        const varName = comp.vλl;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();

        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${memberCode};
                if (${resultVal}) return true;
            }
            return false;
        `;
    }
    _compileUnknownKeyErrors(comp: JitErrorsCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileUnknownKeyErrors(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileStripUnknownKeys(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileStripUnknownKeys(comp);
        return this.traverseCode(comp, memberCode);
    }
    _compileUnknownKeysToUndefined(comp: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileUnknownKeysToUndefined(comp);
        return this.traverseCode(comp, memberCode);
    }

    traverseCode(comp: JitCompiler, memberCode: string): string {
        if (!memberCode) return '';
        const index = this.getChildVarName();
        return `
            for (let ${index} = 0; ${index} < ${comp.vλl}.length; ${index}++) {
                ${memberCode}
            }
        `;
    }

    _mock(ctx: MockOperation): any[] {
        const length = ctx.arrayLength ?? random(0, ctx.maxRandomArrayLength);
        return Array.from({length}, () => this.getMemberType().mock(ctx));
    }
}
