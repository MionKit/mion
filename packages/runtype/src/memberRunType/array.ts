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
import {getJitErrorPath, getExpected, shouldSkiJsonEncode, shouldSkipJit, shouldSkipJsonDecode} from '../utils';
import {JitFnIDs} from '../constants';

export class ArrayRunType extends MemberRunType<TypeArray> {
    src: TypeArray = null as any; // will be set after construction
    getChildVarName(): string {
        return `iε${this.getNestLevel()}`;
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
    jitFnHasReturn(copId: JitFnID): boolean {
        switch (copId) {
            case JitFnIDs.isType:
                return true;
            case JitFnIDs.jsonStringify:
                return true;
            default:
                return super.jitFnHasReturn(copId);
        }
    }

    // #### jit code ####

    _compileIsType(cop: JitCompiler): string {
        const varName = cop.vλl;
        const resultVal = `rεs${cop.length}`;
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
        if (shouldSkiJsonEncode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonEncode(cop)}
            }
        `;
    }
    _compileJsonDecode(cop: JitCompiler): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        if (shouldSkipJsonDecode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonDecode(cop)}
            }
        `;
    }
    _compileJsonStringify(cop: JitCompiler): string {
        const varName = cop.vλl;
        const jsonItems = `jsonItεms${cop.length}`;
        const resultVal = `rεs${cop.length}`;
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
