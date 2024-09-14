/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {JitOperation, MockContext, JitTypeErrorOperation} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {random} from '../mock';
import {SingleItemCollectionRunType} from '../baseRunTypes';
import {isCollectionRunType} from '../guards';

/**
 * Unions get encoded into an array where arr[0] is the discriminator and arr[1] is the value.
 * this is because some times we can't distinguish the type of an union.
 * ie: bigint gets encoded into an string, so if we have an union 'type U = string | bigint' we can't distinguish between the when encoding/decoding the json.
 * to solve this issue the index of the type is used as a discriminator.
 * So [0, "123n"] is interpreted as a string and [1, "123n"] is interpreted as a bigint.
 * */
export class UnionRunType extends SingleItemCollectionRunType<TypeUnion> {
    src: TypeUnion = null as any; // will be set after construction
    getName(): string {
        return 'union';
    }

    // #### collection's jit code ####
    protected _compileIsType(op: JitOperation): string {
        return this.compileChildren((nextOp: JitOperation) => this.compileIsTypeChildren(nextOp), op);
    }
    protected _compileTypeErrors(op: JitTypeErrorOperation): string {
        const errorsVarName = op.args.εrrors;
        // if we do all checks and code reaches this point then we can add an error for the root type
        return `
            ${this.compileChildren((nextOp: JitTypeErrorOperation) => this.compileTypeErrorsChildren(nextOp), op)}
            ${errorsVarName}.push({path: ${getJitErrorPath(op)}, expected: ${getExpected(this)}});
        `;
    }
    /**
     * When a union is encode to json is encode into and array with two elements: [unionDiscriminator, encoded Value]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    protected _compileJsonEncode(op: JitOperation): string {
        const varName = op.args.vλl;
        return `
                ${this.compileChildren((nextOp: JitOperation) => this.compileJsonEncodeChildren(nextOp), op)}
                else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
    }
    /**
     * When a union is decoded from json it expects de two elements array format: [unionDiscriminator, Value to decodeßß]
     * the first element is the index of the type in the union.
     * the second element is the encoded value of the type.
     * ie: type union = string | number | bigint;  var v1: union = 123n;  v1 is encoded as [2, "123n"]
     */
    protected _compileJsonDecode(op: JitOperation): string {
        return `
                ${this.compileChildren((nextOp: JitOperation) => this.compileJsonDecodeChildren(nextOp), op)}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${op.args.vλl}?.constructor?.name || typeof ${op.args.vλl}) }
            `;
    }
    protected _compileJsonStringify(op: JitOperation): string {
        return `
            ${this.compileChildren((nextOp: JitOperation) => this.compileJsonStringifyChildren(nextOp), op)}
            else { throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${op.args.vλl}?.constructor?.name || typeof ${op.args.vλl}) }
        `;
    }

    // #### members jit code ####
    private compileIsTypeChildren(op: JitOperation): string {
        const children = this.getJitChildren();
        return `(${children.map((rt) => rt.compileIsType(op)).join(' || ')})`;
    }
    private compileTypeErrorsChildren(op: JitTypeErrorOperation): string {
        const childErrors = op.args.εrrors;
        const atomicChildren = this.getChildRunTypes().filter((rt) => !isCollectionRunType(rt));
        // TODO, old TS version, does not catch the type of rt, any[] is used to avoid compilation errors
        const collectionChildren: any[] = this.getChildRunTypes().filter((rt) => isCollectionRunType(rt));

        // on atomic types if value matches a atomic type we can say the type is correct and return without adding errors
        const atomicItemsCode = atomicChildren
            .map((rt) => {
                // if match an union type then don't need to check the rest of the types
                return `if (${rt.compileIsType(op)}) return ${childErrors};`;
            })
            .join('\n');

        // on collection types if value matches the collection type (ie: array or object, etc) we need to check type errors for that type and return if no errors are found
        // if errors are found we can continue checking the rest of the types
        const collectionsItemsCode = collectionChildren
            .map((rt, i) => {
                const isCollectionType = false; // TODO upgrade union algorithm
                // if there are no errors found that means the type is correct and we can return
                const errorsBefore = `εrrors${i}Bef${op.stack.length}`;
                return `if (${isCollectionType}) {
                        const ${errorsBefore} = ${childErrors}.length;
                        ${rt.compileTypeErrors(op)}
                        if(${errorsBefore} === ${childErrors}.length) return ${childErrors};
                    }`;
            })
            .join('\n');
        return `${atomicItemsCode} ${collectionsItemsCode}`;
    }
    private compileJsonEncodeChildren(op: JitOperation): string {
        const childVarName = op.args.vλl;
        return this.getChildRunTypes()
            .map((rt, i) => {
                const itemCode = rt.compileJsonEncode(op);
                const iF = i === 0 ? 'if' : 'else if';
                // item encoded before reassigning varName to [i, item]
                return `${iF} (${rt.compileIsType(op)}) {${childVarName} = [${i}, ${childVarName}]; ${itemCode}}`;
            })
            .join('');
    }
    private compileJsonDecodeChildren(op: JitOperation): string {
        const discriminator = `${op.args.vλl}[0]`;
        return this.getChildRunTypes()
            .map((rt, i) => {
                const itemCode = `${rt.compileJsonDecode(op)};`;
                const iF = i === 0 ? 'if' : 'else if';
                // item is decoded before being extracted from the arrayßß
                return `${iF} ( ${discriminator} === ${i}) {${itemCode} ${discriminator} = ${op.args.vλl}}`;
            })
            .join('');
    }
    private compileJsonStringifyChildren(op: JitOperation): string {
        return this.getChildRunTypes()
            .map((rt, i) => {
                return `if (${rt.compileIsType(op)}) {return ('[' + ${i} + ',' + ${rt.compileJsonStringify(op)} + ']');}`;
            })
            .join('');
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
}
