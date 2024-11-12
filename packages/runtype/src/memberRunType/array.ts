/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {JitFnID, MockContext} from '../types';
import {mockRecursiveEmptyArray, random} from '../mock';
import {MemberRunType} from '../baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {getJitErrorPath, getExpected, shouldSkipJit, childIsExpression} from '../utils';
import {JitFnIDs} from '../constants';

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

    _compileIsType(cop: JitCompiler): string {
        const varName = cop.vλl;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) return `Array.isArray(${varName})`;
        return `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileIsType(cop)};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) {
            return `if (!Array.isArray(${varName})) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});`;
        }
        return `
            if (!Array.isArray(${varName})) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.getMemberType().compileTypeErrors(cop)}
                }
            }
        `;
    }
    _compileJsonEncode(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonEncodeChild();
        if (!child) return '';
        const childCode = child.compileJsonEncode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonEncode, child);
        const code = isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        const child = this.getJsonDecodeChild();
        if (!child) return '';
        const childCode = child.compileJsonDecode(cop);
        const isExpression = childIsExpression(cop, JitFnIDs.jsonDecode, child);
        const code = isExpression ? `${cop.getChildVλl()} = ${childCode};` : childCode;
        return `for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {${code}}`;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const varName = cop.vλl;
        const jsonItems = `ls${this.getNestLevel()}`;
        const resultVal = `res${this.getNestLevel()}`;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) return `JSON.stringify(${varName})`;
        return `
            const ${jsonItems} = [];
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${this.getMemberType().compileJsonStringify(cop)};
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
    }
    _compileHasUnknownKeys(cop: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileHasUnknownKeys(cop);
        if (!memberCode) return '';
        const varName = cop.vλl;
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
    _compileUnknownKeyErrors(cop: JitErrorsCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileUnknownKeyErrors(cop);
        return this.traverseCode(cop, memberCode);
    }
    _compileStripUnknownKeys(cop: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileStripUnknownKeys(cop);
        return this.traverseCode(cop, memberCode);
    }
    _compileUnknownKeysToUndefined(cop: JitCompiler): string {
        if (this.getMemberType().getFamily() === 'A' || shouldSkipJit(this)) return '';
        const memberCode = this.getMemberType().compileUnknownKeysToUndefined(cop);
        return this.traverseCode(cop, memberCode);
    }

    traverseCode(cop: JitCompiler, memberCode: string): string {
        if (!memberCode) return '';
        const index = this.getChildVarName();
        return `
            for (let ${index} = 0; ${index} < ${cop.vλl}.length; ${index}++) {
                ${memberCode}
            }
        `;
    }

    mock(ctx?: Pick<MockContext, 'arrayLength'>): any[] {
        const length = ctx?.arrayLength ?? random(0, 30);
        if (this.isCircular) {
            const depth = random(1, 5);
            // specific scenario where array is circular with itself, i.e: CircularArray = CircularArray[]
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.getMemberType().mock(ctx));
    }
}
