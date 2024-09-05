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
} from '../jitCircular';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {TupleMemberRunType} from './tupleMember';

export class TupleRunType extends CollectionRunType<TypeTuple> {
    public readonly childRunTypes: TupleMemberRunType[];
    public readonly jitId: string = '$';
    get isJsonEncodeRequired(): boolean {
        return this.childRunTypes.some((rt) => rt.isJsonEncodeRequired);
    }
    get isJsonDecodeRequired(): boolean {
        return this.childRunTypes.some((rt) => rt.isJsonDecodeRequired);
    }
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTuple,
        public readonly parents: RunType[],
        readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.childRunTypes = src.types.map((t) => visitor(t, parents, opts) as TupleMemberRunType);
        parents.pop();
        this.jitId = `${this.src.kind}[${this.childRunTypes.map((prop) => `${prop.jitId}`).join(',')}]`;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            const compileChildren = (newParents) =>
                this.childRunTypes.map((rt, i) => rt.compileIsType(newParents, `${varName}[${i}]`)).join(' && ');
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `(Array.isArray(${varName}) && ${varName}.length <= ${this.childRunTypes.length} && (${itemsCode}))`;
        };
        return handleCircularIsType(this, compile, callArgs, nestLevel, false);
    }
    compileCollectionIsType(parents: RunType[], varName: string): string {
        return `(Array.isArray(${varName}) && ${varName}.length <= ${this.childRunTypes.length})`;
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compile = () => {
            const compileChildren = (newParents) =>
                this.childRunTypes
                    .map((rt, i) => {
                        const accessor = `${varName}[${i}]`;
                        const newPath = [...pathC, i];
                        return rt.compileTypeErrors(newParents, accessor, newPath);
                    })
                    .join(';');
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                if (!Array.isArray(${varName}) || ${varName}.length > ${this.childRunTypes.length}) ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}});
                else {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    compileJsonEncode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (shouldSkipJsonEncode(this)) return '';
                const childrenCode = this.childRunTypes.map((rt, i) => {
                    const accessor = `${varName}[${i}]`;
                    return rt.compileJsonEncode(newParents, accessor);
                });
                return childrenCode.filter((code) => !!code).join(';');
            });
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonDecode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                if (shouldSkipJsonDecode(this)) return varName;
                const decodeCodes = this.childRunTypes.map((rt, i) => {
                    const accessor = `${varName}[${i}]`;
                    return rt.compileJsonDecode(newParents, accessor);
                });
                return decodeCodes.filter((code) => !!code).join(';');
            });
        };
        return handleCircularJsonDecode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            const compileChildren = (newParents) => {
                const encodeCodes = this.childRunTypes.map((rt, i) => {
                    const accessor = `${varName}[${i}]`;
                    return rt.compileJsonStringify(newParents, accessor);
                });
                return encodeCodes.join(`+','+`);
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `'['+${itemsCode}+']'`;
        };
        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, false);
    }
    mock(...tupleArgs: any[][]): any[] {
        return this.childRunTypes.map((rt, i) => rt.mock(...(tupleArgs?.[i] || [])));
    }
}
