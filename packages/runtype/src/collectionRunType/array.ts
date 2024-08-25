/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected, hasCircularParents} from '../utils';
import {mockRecursiveEmptyArray, random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCompiler';
import {jitNames} from '../constants';

export class ArrayRunType extends CollectionRunType<TypeArray> {
    public readonly isJsonEncodeRequired;
    public readonly isJsonDecodeRequired;
    public readonly childRunTypes: RunType[];
    public readonly jitId: string;
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
        this.isJsonEncodeRequired = this.childRunTypes[0].isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.childRunTypes[0].isJsonDecodeRequired;
        this.jitId = `${this.src.kind}[${this.childRunTypes[0].jitId}]`;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const {index, indexAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const resultVal = `rεsult${nestLevel}`;
        const callArgs = [varName];
        const compileChildren = (newParents) => this.childRunTypes[0].compileIsType(newParents, indexAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            if (!Array.isArray(${varName})) return false;
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${itemsCode};
                if (!(${resultVal})) return false;
            }
            return true;
        `;
        return handleCircularIsType(this, code, callArgs, isCompilingCircularChild, nestLevel);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {index, indexAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compileChildren = (newParents) => {
            const newPath = [...pathC, index];
            return this.childRunTypes[0].compileTypeErrors(newParents, indexAccessor, newPath);
        };
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            if (!Array.isArray(${varName})) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}});
            else {
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${itemsCode}
                }
            }
        `;
        return handleCircularTypeErrors(this, code, callArgs, isCompilingCircularChild, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const {index, indexAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => this.childRunTypes[0].compileJsonEncode(newParents, indexAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${itemsCode}
            }
        `;
        const encodeCode = this.isJsonEncodeRequired ? code : '';
        return handleCircularJsonEncode(this, encodeCode, callArgs, isCompilingCircularChild);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {index, indexAccessor, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => this.childRunTypes[0].compileJsonDecode(newParents, indexAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                ${itemsCode}
            }
        `;
        const decodeCode = this.isJsonDecodeRequired ? code : '';
        return handleCircularJsonDecode(this, decodeCode, callArgs, isCompilingCircularChild);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const {index, indexAccessor, isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const jsonItems = `jsonItεms${nestLevel}`;
        const resultVal = `rεsult${nestLevel}`;
        const callArgs = [varName];
        const compileChildren = (newParents) => this.childRunTypes[0].compileJsonStringify(newParents, indexAccessor);
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `
            const ${jsonItems} = [];
            for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                const ${resultVal} = ${itemsCode};
                ${jsonItems}.push(${resultVal});
            }
            return '[' + ${jsonItems}.join(',') + ']';
        `;
        return handleCircularJsonStringify(this, code, callArgs, isCompilingCircularChild, nestLevel);
    }
    mock(length = random(0, 30), ...args: any[]): any[] {
        if (this.isCircular) {
            const depth = random(1, 5);
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.childRunTypes[0].mock(...args));
    }
}

function getJitVars(rt: ArrayRunType, parents: RunType[], varName: string) {
    const nestLevel = parents.length;
    const isCompilingCircularChild = hasCircularParents(rt, parents);
    const index = `iε${nestLevel}`;
    return {
        nestLevel,
        isCompilingCircularChild,
        index,
        indexAccessor: `${varName}[${index}]`,
    };
}
