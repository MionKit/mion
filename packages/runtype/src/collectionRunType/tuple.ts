/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {CollectionRunType} from '../baseRunTypes';
import {jitNames} from '../constants';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCompiler';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected, hasCircularParents, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly childRunTypes: RunType[];
    public readonly jitId: string;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTuple,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.childRunTypes = src.types.map((t) => visitor(t, parents, opts));
        parents.pop();
        this.isJsonEncodeRequired = this.childRunTypes.some((rt) => rt.isJsonEncodeRequired);
        this.isJsonDecodeRequired = this.childRunTypes.some((rt) => rt.isJsonDecodeRequired);
        this.jitId = `${this.src.kind}[${this.childRunTypes.map((prop) => `${prop.jitId}`).join(',')}]`;
    }
    compileIsType(parents: RunType[], varName: string): string {
        const {isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) =>
            this.childRunTypes.map((rt, i) => rt.compileIsType(newParents, `${varName}[${i}]`)).join(' && ');
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `${varName}.length <= ${this.childRunTypes.length} && (${itemsCode})`;
        return handleCircularIsType(this, code, callArgs, isCompilingCircularChild, nestLevel, false);
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const {index, isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compileChildren = (newParents) =>
            this.childRunTypes
                .map((rt, i) => {
                    const accessor = `${varName}[${i}]`;
                    const newPath = [...pathC, i];
                    return rt.compileTypeErrors(newParents, accessor, newPath);
                })
                .join(';');
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
        const {isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => {
            if (shouldSkipJsonEncode(this)) return '';
            const childrenCode = this.childRunTypes.map((rt, i) => {
                const useNative = !this.opts?.strictJSON && !rt.isJsonEncodeRequired;
                const accessor = `${varName}[${i}]`;
                return useNative ? `` : `${accessor} = ${rt.compileJsonEncode(newParents, accessor)}`;
            });
            return childrenCode.filter((code) => !!code).join(';');
        };
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        return handleCircularJsonEncode(this, itemsCode, callArgs, isCompilingCircularChild);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const {isCompilingCircularChild} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => {
            if (shouldSkipJsonDecode(this)) return varName;
            const decodeCodes = this.childRunTypes.map((rt, i) => {
                const useNative = !this.opts?.strictJSON && !rt.isJsonDecodeRequired;
                const accessor = `${varName}[${i}]`;
                return useNative ? `` : `${accessor} = ${rt.compileJsonDecode(newParents, accessor)}`;
            });
            return decodeCodes.filter((code) => !!code).join(';');
        };
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        return handleCircularJsonDecode(this, itemsCode, callArgs, isCompilingCircularChild);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const {isCompilingCircularChild, nestLevel} = getJitVars(this, parents, varName);
        const callArgs = [varName];
        const compileChildren = (newParents) => {
            const encodeCodes = this.childRunTypes.map((rt, i) => {
                const accessor = `${varName}[${i}]`;
                rt.compileJsonStringify(newParents, accessor);
            });
            return encodeCodes.join(`+','+`);
        };
        const itemsCode = compileChildrenJitFunction(this, parents, isCompilingCircularChild, compileChildren);
        const code = `'['+${itemsCode}+']'`;
        return handleCircularJsonStringify(this, code, callArgs, isCompilingCircularChild, nestLevel, false);
    }
    mock(...tupleArgs: any[][]): any[] {
        return this.childRunTypes.map((rt, i) => rt.mock(...(tupleArgs?.[i] || [])));
    }
}

function getJitVars(rt: TupleRunType, parents: RunType[], varName: string) {
    const nestLevel = parents.length;
    const isCompilingCircularChild = hasCircularParents(rt, parents);
    return {
        nestLevel,
        isCompilingCircularChild,
        index: `iε${nestLevel}`,
        indexAccessor: `${varName}[iε${nestLevel}]`,
    };
}
