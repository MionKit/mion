/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeArray} from '../_deepkit/src/reflection/type';
import {JitContext, JitPathItem, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected} from '../utils';
import {mockRecursiveEmptyArray, random} from '../mock';
import {CollectionRunType} from '../baseRunTypes';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';

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

    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const index = `iε${ctx.parents.length}`;
            const resultVal = `rεsult${ctx.parents.length}`;
            const childPath: JitPathItem = {vλl: index, useArrayAccessor: true};
            const compC = (childCtx: JitContext) => this.child.compileIsType(childCtx);
            return `
                if (!Array.isArray(${varName})) return false;
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    const ${resultVal} = ${compileChildren(compC, this, ctx, childPath)};
                    if (!(${resultVal})) return false;
                }
                return true;
            `;
        };
        return handleCircularIsType(compile, this, ctx, true);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const errorsName = ctx.args.εrrors;
            const index = `iε${ctx.parents.length}`;
            const childPath: JitPathItem = {vλl: index, useArrayAccessor: true};
            const compC = (childCtx: TypeErrorsContext) => this.child.compileTypeErrors(childCtx);
            return `
                if (!Array.isArray(${varName})) ${errorsName}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}});
                else {
                    for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                        ${compileChildren(compC, this, ctx, childPath)}
                    }
                }
            `;
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.jsonEncDec(ctx, true);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.jsonEncDec(ctx, false);
    }
    private jsonEncDec(ctx: JitContext, isEncode: boolean): string {
        const compile = () => {
            const skip = isEncode ? !this.isJsonEncodeRequired : !this.isJsonDecodeRequired;
            const index = `iε${ctx.parents.length}`;
            if (skip) return '';
            const varName = ctx.args.vλl;
            const childPath: JitPathItem = {vλl: index, useArrayAccessor: true};
            const encDec = isEncode ? this.child.compileJsonEncode : this.child.compileJsonDecode;
            const compC = (childCtx: JitContext) => encDec(childCtx);
            return `
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    ${compileChildren(compC, this, ctx, childPath)}
                }
            `;
        };
        const circularEncDEc = isEncode ? handleCircularJsonEncode : handleCircularJsonDecode;
        return circularEncDEc(compile, this, ctx);
    }

    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const index = `iε${ctx.parents.length}`;
            const jsonItems = `jsonItεms${ctx.parents.length}`;
            const resultVal = `rεsult${ctx.parents.length}`;
            const childPath: JitPathItem = {vλl: index, useArrayAccessor: true};
            const compC = (childCtx: JitContext) => this.child.compileJsonStringify(childCtx);
            return `
                const ${jsonItems} = [];
                for (let ${index} = 0; ${index} < ${varName}.length; ${index}++) {
                    const ${resultVal} = ${compileChildren(compC, this, ctx, childPath)};
                    ${jsonItems}.push(${resultVal});
                }
                return '[' + ${jsonItems}.join(',') + ']';
            `;
        };
        return handleCircularJsonStringify(compile, this, ctx, true);
    }
    mock(ctx?: Pick<MockContext, 'arrayLength'>): any[] {
        const length = ctx?.arrayLength ?? random(0, 30);
        if (this.isCircularRef) {
            const depth = random(1, 5);
            // specific scenario where array is circular with itself, i.e: CircularArray = CircularArray[]
            return mockRecursiveEmptyArray(depth, length);
        }
        return Array.from({length}, () => this.child.mock(ctx));
    }
}
