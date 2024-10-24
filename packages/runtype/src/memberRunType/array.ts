/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {MockContext} from '../types';
import {mockRecursiveEmptyArray, random} from '../mock';
import {MemberRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {getJitErrorPath, getExpected, shouldSkiJsonEncode, shouldSkipJit, shouldSkipJsonDecode} from '../utils';

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

    hasReturnCompileIsType(): boolean {
        return true;
    }
    hasReturnCompileJsonStringify(): boolean {
        return true;
    }

    // #### jit code ####

    _compileIsType(cop: JitCompileOp): string {
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
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        if (shouldSkipJit(this)) {
            return `if (!Array.isArray(${varName})) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}});`;
        }
        return `
            if (!Array.isArray(${varName})) ${cop.args.εrr}.push({path:${getJitErrorPath(cop)},expected:${getExpected(this)}});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.getMemberType().compileTypeErrors(cop)}
                }
            }
        `;
    }
    _compileJsonEncode(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        if (shouldSkiJsonEncode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonEncode(cop)}
            }
        `;
    }
    _compileJsonDecode(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const index = this.getChildVarName();
        if (shouldSkipJsonDecode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonDecode(cop)}
            }
        `;
    }
    _compileJsonStringify(cop: JitCompileOp): string {
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
