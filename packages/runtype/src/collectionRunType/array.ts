/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected} from '../utils';
import {mockRecursiveEmptyArray, random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {jitNames} from '../constants';

export class ArrayRunType extends CollectionRunType<TypeArray> {
    public readonly childRunTypes: RunType[]; // although array can have only one type, it can reference itself so is considered a collection
    public readonly jitId: string = '$';
    public readonly isJsonEncodeRequired: boolean = false;
    public readonly isJsonDecodeRequired: boolean = false;
    get child() {
        return this.childRunTypes[0];
    }
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeArray,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.childRunTypes = [visitor(src.type, parents, opts)];
        parents.pop();
        this.jitId = `${this.src.kind}[${this.child.jitId}]`;
        this.isJsonEncodeRequired = this.child.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.child.isJsonDecodeRequired;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const {index, indexAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const resultVal = `rεsult${nestLevel}`;
            const compileChildren = (newParents) => this.child.compileIsType(newParents, indexAccessor);
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                if (!Array.isArray(${varName})) return false;
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    const ${resultVal} = ${itemsCode};
                    if (!(${resultVal})) return false;
                }
                return true;
            `;
        };
        return handleCircularIsType(this, compile, callArgs, nestLevel, true);
    }
    compileCollectionIsType(parents: RunType[], varName: string): string {
        return `Array.isArray(${varName})`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {index, indexAccessor} = getJitVars(this, parents, varName);
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compile = () => {
            const compileChildren = (newParents) => {
                const newPath = [...pathC, index];
                return this.child.compileTypeErrors(newParents, indexAccessor, newPath);
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                if (!Array.isArray(${varName})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}});
                else {
                    for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                        ${itemsCode}
                    }
                }
            `;
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {index, indexAccessor} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            if (!this.isJsonEncodeRequired) return '';
            const compileChildren = (newParents) => this.child.compileJsonEncode(newParents, indexAccessor);
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {index, indexAccessor} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            if (!this.isJsonDecodeRequired) return '';
            const compileChildren = (newParents) => this.child.compileJsonDecode(newParents, indexAccessor);
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularJsonDecode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const {index, indexAccessor, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compile = () => {
            const jsonItems = `jsonItεms${nestLevel}`;
            const resultVal = `rεsult${nestLevel}`;
            const compileChildren = (newParents) => this.child.compileJsonStringify(newParents, indexAccessor);
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                const ${jsonItems} = [];
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    const ${resultVal} = ${itemsCode};
                    ${jsonItems}.push(${resultVal});
                }
                return '[' + ${jsonItems}.join(',') + ']';
            `;
        };

        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, true);
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        if (this.isCircularRef) {
            const depth = random(1, 5);
            // specific scenario where array is circular with itself, i.e: CircularArray = CircularArray[]
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.child.mock(...args));
    }
}

function getJitVars(rt: ArrayRunType, parents: RunType[], varName: string) {
    const nestLevel = parents.length;
    const index = `iε${nestLevel}`;
    return {
        nestLevel,
        index,
        indexAccessor: `${varName}[${index}]`,
    };
}
