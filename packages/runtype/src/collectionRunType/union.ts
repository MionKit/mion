/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeUnion} from '../_deepkit/src/reflection/type';
import {JitContext, JitPathItem, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {
    handleCircularIsType,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {isCollectionRunType} from '../guards';
import {compileChildren} from '../jitCompiler';

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

    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx: JitContext) =>
                `(${this.childRunTypes.map((rt) => rt.compileIsType(childCtx)).join(' || ')})`;
            return compileChildren(compC, this, ctx);
        };
        return handleCircularIsType(compile, this, ctx, false);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const errorsVarName = ctx.args.εrrors;
            const compC = (childCtx: TypeErrorsContext) => {
                const childErrors = ctx.args.εrrors;
                const atomicChildren = this.childRunTypes.filter((rt) => !isCollectionRunType(rt));
                // TODO, old TS version, does not catch the type of rt, any[] is used to avoid compilation errors
                const collectionChildren: any[] = this.childRunTypes.filter((rt) => isCollectionRunType(rt));

                // on atomic types if value matches a atomic type we can say the type is correct and return without adding errors
                const atomicItemsCode = atomicChildren
                    .map((rt) => {
                        // if match an union type then don't need to check the rest of the types
                        return `if (${rt.compileIsType(childCtx)}) return ${childErrors};`;
                    })
                    .join('\n');

                // on collection types if value matches the collection type (ie: array or object, etc) we need to check type errors for that type and return if no errors are found
                // if errors are found we can continue checking the rest of the types
                const collectionsItemsCode = collectionChildren
                    .map((rt, i) => {
                        const isCollectionType = false; // TODO upgrade union algorithm
                        // if there are no errors found that means the type is correct and we can return
                        const errorsBefore = `εrrors${i}Bef${childCtx.parents.length}`;
                        return `if (${isCollectionType}) {
                            const ${errorsBefore} = ${childErrors}.length;
                            ${rt.compileTypeErrors(childCtx)}
                            if(${errorsBefore} === ${childErrors}.length) return ${childErrors};
                        }`;
                    })
                    .join('\n');
                return `${atomicItemsCode} ${collectionsItemsCode}`;
            };
            const itemsCode = compileChildren(compC, this, ctx);

            // if we do all checks and code reaches this point then we can add an error for the root type
            return `
                ${itemsCode}
                ${errorsVarName}.push({path: ${getJitErrorPath(ctx)}, expected: ${getExpected(this)}});
            `;
        };
        return handleCircularTypeErrors(compile, this, ctx);
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
    compileJsonEncode(ctx: JitContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const childPath: JitPathItem = {vλl: 1, useArrayAccessor: true, literal: 1};
            const compC = (childCtx: JitContext) => {
                const childVarName = childCtx.args.vλl;
                return this.childRunTypes
                    .map((rt, i) => {
                        const itemCode = shouldSkipJsonEncode(rt) ? '' : rt.compileJsonEncode(childCtx);
                        const iF = i === 0 ? 'if' : 'else if';
                        // item encoded before reassigning varName to [i, item]
                        return `${iF} (${rt.compileIsType(childCtx)}) {${childVarName} = [${i}, ${childVarName}]; ${itemCode}}`;
                    })
                    .join('');
            };
            const itemsCode = compileChildren(compC, this, ctx, childPath);
            return `
                ${itemsCode}
                else { throw new Error('Can not encode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${varName}?.constructor?.name || typeof ${varName}) }
            `;
        };
        return handleCircularJsonEncode(compile, this, ctx);
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
    compileJsonDecode(ctx: JitContext): string {
        const compile = () => {
            const childPath: JitPathItem = {vλl: 1, useArrayAccessor: true, literal: 1};
            const discriminator = `${ctx.args.vλl}[0]`;
            const compC = (childCtx: JitContext) => {
                return this.childRunTypes
                    .map((rt, i) => {
                        const itemCode = shouldSkipJsonDecode(rt) ? '' : `${rt.compileJsonDecode(childCtx)};`;
                        const iF = i === 0 ? 'if' : 'else if';
                        // item is decoded before being extracted from the arrayßß
                        return `${iF} ( ${discriminator} === ${i}) {${itemCode} ${discriminator} = ${childCtx.args.vλl}}`;
                    })
                    .join('');
            };
            const itemsCode = compileChildren(compC, this, ctx, childPath);
            return `
                ${itemsCode}
                else { throw new Error('Can not decode json to union: expected one of <${this.getUnionTypeNames()}> but got ' + ${ctx.args.vλl}?.constructor?.name || typeof ${ctx.args.vλl}) }
            `;
        };
        return handleCircularJsonEncode(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx: JitContext) => {
                return this.childRunTypes
                    .map((rt, i) => {
                        return `
                        if (${rt.compileIsType(childCtx)}) {
                            return ('[' + ${i} + ',' + ${rt.compileJsonStringify(childCtx)} + ']');
                        }`;
                    })
                    .join('');
            };
            const itemsCode = compileChildren(compC, this, ctx);
            return `
                ${itemsCode}
                else { throw new Error('Can not stringify union: expected one of <${this.getUnionTypeNames()}> but got ' + ${ctx.args.vλl}?.constructor?.name || typeof ${ctx.args.vλl}) }
            `;
        };
        return handleCircularJsonStringify(compile, this, ctx, true);
    }
    mock(ctx?: Pick<MockContext, 'unionIndex'>): any {
        if (ctx?.unionIndex && (ctx.unionIndex < 0 || ctx.unionIndex >= this.childRunTypes.length)) {
            throw new Error('unionIndex must be between 0 and the number of types in the union');
        }
        const index = ctx?.unionIndex ?? random(0, this.childRunTypes.length - 1);
        return this.childRunTypes[index].mock(ctx);
    }
    getUnionTypeNames(): string {
        return this.childRunTypes.map((rt) => rt.getName()).join(' | ');
    }
}
