/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {MockContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {isCollectionRunType} from '../guards';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends CollectionRunType<TypeUnion> {
    src: TypeUnion = null as any; // will be set after construction
    getName(): string {
        return 'union';
    }
    // #### collection's jit code ####
    _compileIsType(cop: JitCompileOp): string {
        const children = this.getJitChildren();
        return `(${children.map((rt) => rt.compileIsType(cop)).join(' || ')})`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp): string {
        const errorsVarName = cop.args.εrr;
        const childErrors = cop.args.εrr;
        const atomicChildren = this.getChildRunTypes().filter((rt) => !isCollectionRunType(rt));
        // TODO, old TS version, does not catch the type of rt, any[] is used to avoid compilation errors
        const collectionChildren: any[] = this.getChildRunTypes().filter((rt) => isCollectionRunType(rt));

        // on atomic types if value matches a atomic type we can say the type is correct and return without adding errors
        const atomicItemsCode = atomicChildren
            .map((rt) => {
                // if match an union type then don't need to check the rest of the types
                return `if (${rt.compileIsType(cop)}) return ${childErrors};`;
            })
            .join('\n');

        // on collection types if value matches the collection type (ie: array or object, etc) we need to check type errors for that type and return if no errors are found
        // if errors are found we can continue checking the rest of the types
        const collectionsItemsCode = collectionChildren
            .map((rt, i) => {
                const isCollectionType = false; // TODO upgrade union algorithm
                // if there are no errors found that means the type is correct and we can return
                const errorsBefore = `εrr${i}Bef${cop.length}`;
                return `if (${isCollectionType}) {
                        const ${errorsBefore} = ${childErrors}.length;
                        ${rt.compileTypeErrors(cop)}
                        if(${errorsBefore} === ${childErrors}.length) return ${childErrors};
                    }`;
            })
            .join('\n');
        // if we do all checks and code reaches this point then we can add an error for the root type
        return `
            ${atomicItemsCode}
            ${collectionsItemsCode}
            ${errorsVarName}.push({path: ${getJitErrorPath(cop)},expected: ${getExpected(this)}});
        `;
    }
    /**
     * When a union is encode to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileJsonEncode(cop: JitCompileOp): string {
        const varName = cop.vλl;
        const childVarName = cop.vλl;
        const childrenCode = this.getChildRunTypes()
            .map((rt, i) => {
                const itemCode = rt.compileJsonEncode(cop);
                const iF = i === 0 ? 'if' : 'else if';
                // item encoded before reassigning varName to [i, item]
                return `${iF} (${rt.compileIsType(cop)}) {${childVarName} = [${i}, ${childVarName}]; ${itemCode}}`;
            })
            .join('');
        return `
                ${childrenCode}
                else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
    }
    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decode]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    _compileJsonDecode(cop: JitCompileOp): string {
        const discriminator = `${cop.vλl}[0]`;
        const childrenCode = this.getChildRunTypes()
            .map((rt, i) => {
                const itemCode = `${rt.compileJsonDecode(cop)};`;
                const iF = i === 0 ? 'if' : 'else if';
                // item is decoded before being extracted from the array
                return `${iF} ( ${discriminator} === ${i}) {${itemCode} ${discriminator} = ${cop.vλl}}`;
            })
            .join('');
        return `
                ${childrenCode}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${cop.vλl}?.constructor?.name || typeof ${cop.vλl}) }
            `;
    }
    _compileJsonStringify(cop: JitCompileOp): string {
        const childrenCode = this.getChildRunTypes()
            .map((rt, i) => {
                return `if (${rt.compileIsType(cop)}) {return ('[' + ${i} + ',' + ${rt.compileJsonStringify(cop)} + ']');}`;
            })
            .join('');
        return `
            ${childrenCode}
            else { throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${cop.vλl}?.constructor?.name || typeof ${cop.vλl}) }
        `;
    }
    mock(ctx?: Pick<MockContext, 'unionIndex'>): any {
        if (ctx?.unionIndex && (ctx.unionIndex < 0 || ctx.unionIndex >= this.getChildRunTypes().length)) {
            throw new Error('unionIndex must be between 0 and the number of types in the union');
        }
        const index = ctx?.unionIndex ?? random(0, this.getChildRunTypes().length - 1);
        return this.getChildRunTypes()[index].mock(ctx);
    }
    getUnionTypeNames(): string {
        return this.getChildRunTypes()
            .map((rt) => rt.getName())
            .join(' | ');
    }

    hasReturnCompileIsType(): boolean {
        return true;
    }
    hasReturnCompileTypeErrors(): boolean {
        return true;
    }
    hasReturnCompileJsonEncode(): boolean {
        return true;
    }
    hasReturnCompileJsonDecode(): boolean {
        return true;
    }
    hasReturnCompileJsonStringify(): boolean {
        return true;
    }
}
