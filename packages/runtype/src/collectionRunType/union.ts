/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {RunType, RunTypeOptions, RunTypeVisitor} from '../types';
import {getErrorPath, getExpected, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {jitNames} from '../constants';
import {
    compileChildrenJitFunction,
    handleCircularIsType,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {isCollectionRunType} from '../guards';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends CollectionRunType<TypeUnion> {
    public readonly childRunTypes: RunType[];
    public readonly jitId: string = '$';
    get isJsonEncodeRequired(): boolean {
        return true;
    }
    get isJsonDecodeRequired(): boolean {
        return true;
    }
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeUnion,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.childRunTypes = src.types.map((t) => visitor(t, parents, opts));
        parents.pop();
        this.jitId = `${this.src.kind}[${this.childRunTypes.map((prop) => `${prop.jitId}`).join('|')}]`;
    }

    compileIsType(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            return compileChildrenJitFunction(this, parents, (newParents) => {
                return `(${this.childRunTypes.map((rt) => rt.compileIsType(newParents, varName)).join(' || ')})`;
            });
        };
        return handleCircularIsType(this, compile, callArgs, nestLevel, false);
    }
    compileCollectionIsType(parents: RunType[], varName: string): string {
        return (
            this.childRunTypes
                .filter((rt) => isCollectionRunType(rt))
                // TODO, old TS version, does not catch the type of rt, any is used to avoid compilation errors
                .map((rt: any) => rt.compileCollectionIsType(parents, varName))
                .join(' || ')
        );
    }
    compileTypeErrors(parents: RunType[], varName: string, pathC: string[]): string {
        const nestLevel = parents.length;
        const callArgs = [varName, jitNames.errors, jitNames.circularPath];
        const compile = () => {
            const compileChildren = (newParents) => {
                const atomicChildren = this.childRunTypes.filter((rt) => !isCollectionRunType(rt));
                // TODO, old TS version, does not catch the type of rt, any[] is used to avoid compilation errors
                const collectionChildren: any[] = this.childRunTypes.filter((rt) => isCollectionRunType(rt));

                // on atomic types if value matches a atomic type we can say the type is correct and return without adding errors
                const atomicItemsCode = atomicChildren
                    .map((rt) => {
                        // if match an union type then don't need to check the rest of the types
                        return `if (${rt.compileIsType(newParents, varName)}) return ${jitNames.errors};`;
                    })
                    .join('\n');

                // on collection types if value matches the collection type (ie: array or object, etc) we need to check type errors for that type and return if no errors are found
                // if errors are found we can continue checking the rest of the types
                const collectionsItemsCode = collectionChildren
                    .map((rt, i) => {
                        const isCollectionType = rt.compileCollectionIsType(newParents, varName);
                        // if there are no errors found that means the type is correct and we can return
                        const errorsBefore = `εrrs${i}Bef${nestLevel}`;
                        return `if (${isCollectionType}) {
                            const ${errorsBefore} = ${jitNames.errors}.length;
                            ${rt.compileTypeErrors(newParents, varName, pathC)}
                            if(${errorsBefore} === ${jitNames.errors}.length) return ${jitNames.errors};
                        }`;
                    })
                    .join('\n');
                return `${atomicItemsCode} ${collectionsItemsCode}`;
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);

            // if we do all checks and code reaches this point then we can add an error for the root type
            return `
                ${itemsCode}
                ${jitNames.errors}.push({path: ${getErrorPath(pathC)}, expected: ${getExpected(this)}});
            `;
        };
        return handleCircularTypeErrors(this, compile, callArgs, pathC);
    }
    /**
     * When a union is encode to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     * @param parents
     * @param varName
     * @returns
     */
    compileJsonEncode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            const compileChildren = (newParents) => {
                return this.childRunTypes
                    .map((rt, i) => {
                        const accessor = `${varName}[1]`;
                        const itemCode = shouldSkipJsonEncode(rt) ? '' : rt.compileJsonEncode(newParents, accessor);
                        const iF = i === 0 ? 'if' : 'else if';
                        // item encoded before reassigning varName to [i, item]
                        return `${iF} (${rt.compileIsType(newParents, varName)}) {${varName} = [${i}, ${varName}]; ${itemCode}}`;
                    })
                    .join('');
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                ${itemsCode}
                else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }

    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decodeßß]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     * @param parents
     * @param varName
     * @returns
     */
    compileJsonDecode(parents: RunType[], varName: string): string {
        const callArgs = [varName];
        const compile = () => {
            const compileChildren = (newParents) => {
                return this.childRunTypes
                    .map((rt, i) => {
                        const accessor = `${varName}[1]`;
                        const itemCode = shouldSkipJsonDecode(rt) ? '' : `${rt.compileJsonDecode(newParents, accessor)};`;
                        const iF = i === 0 ? 'if' : 'else if';
                        // item is decoded before being extracted from the arrayßß
                        return `${iF} (${varName}[0] === ${i}) {${itemCode} ${varName} = ${accessor}}`;
                    })
                    .join('');
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                ${itemsCode}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
        };
        return handleCircularJsonEncode(this, compile, callArgs);
    }
    compileJsonStringify(parents: RunType[], varName: string): string {
        const nestLevel = parents.length;
        const callArgs = [varName];
        const compile = () => {
            const compileChildren = (newParents) => {
                return this.childRunTypes
                    .map((rt, i) => {
                        return `
                        if (${rt.compileIsType(newParents, varName)}) {
                            return ('[' + ${i} + ',' + ${rt.compileJsonStringify(newParents, varName)} + ']');
                        }`;
                    })
                    .join('');
            };
            const itemsCode = compileChildrenJitFunction(this, parents, compileChildren);
            return `
                ${itemsCode}
                else { throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
        };
        return handleCircularJsonStringify(this, compile, callArgs, nestLevel, true);
    }
    mock(...unionArgs: any[][]): string {
        const unionMock = this.childRunTypes.map((rt, i) => rt.mock(...(unionArgs?.[i] || [])));
        return unionMock[random(0, unionMock.length - 1)];
    }
    private _unionTypeNames: string | undefined;
    getUnionTypeNames(): string {
        if (this._unionTypeNames) return this._unionTypeNames;
        return (this._unionTypeNames = this.childRunTypes.map((rt) => rt.getName()).join(' | '));
    }
}
