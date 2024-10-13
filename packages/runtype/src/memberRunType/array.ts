/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {PathItem, MockContext} from '../types';
import {mockRecursiveEmptyArray, random} from '../mock';
import {MemberRunType} from '../baseRunTypes';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';
import {getJitErrorPath, getExpected, shouldSkiJsonEncode, shouldSkipJit, shouldSkipJsonDecode} from '../utils';

export class ArrayRunType extends MemberRunType<TypeArray> {
    src: TypeArray = null as any; // will be set after construction
    getName() {
        return `array`;
    }
    getMemberName(): '' {
        return ''; // Although array is considered a Member run type, it has no name like a property or method
    }
    useArrayAccessor() {
        return true;
    }
    isOptional(): boolean {
        return false;
    }
    getJitChildrenPath(cop: JitCompileOp): PathItem {
        const index = this.getIndexName(cop);
        return cop.newPathItem(index, index, true);
    }
    private getIndexName(cop: JitCompileOp): string {
        return `iε${cop.length}`;
    }
    protected hasReturnCompileIsType(): boolean {
        return true;
    }
    protected hasReturnCompileJsonStringify(): boolean {
        return true;
    }

    protected _compileIsType(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const resultVal = `rεsult${cop.length}`;
        const index = this.getIndexName(cop);
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
    protected _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const varName = cop.vλl;
        const errorsName = cop.args.εrrors;
        const index = this.getIndexName(cop);
        if (shouldSkipJit(this)) {
            return `if (!Array.isArray(${varName})) ${errorsName}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}});`;
        }
        return `
            if (!Array.isArray(${varName})) ${errorsName}.push({path: ${getJitErrorPath(cop)}, expected: ${getExpected(this)}});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${this.getMemberType().compileTypeErrors(cop)}
                }
            }
        `;
    }
    protected _compileJsonEncode(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const index = this.getIndexName(cop);
        if (shouldSkiJsonEncode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonEncode(cop)}
            }
        `;
    }
    protected _compileJsonDecode(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const index = this.getIndexName(cop);
        if (shouldSkipJsonDecode(this)) return '';
        return `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${this.getMemberType().compileJsonDecode(cop)}
            }
        `;
    }
    protected _compileJsonStringify(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const jsonItems = `jsonItεms${cop.length}`;
        const resultVal = `rεsult${cop.length}`;
        const index = this.getIndexName(cop);
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
        if (this.getJitConstants().isCircularRef) {
            const depth = random(1, 5);
            // specific scenario where array is circular with itself, i.e: CircularArray = CircularArray[]
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.getMemberType().mock(ctx));
    }
}
