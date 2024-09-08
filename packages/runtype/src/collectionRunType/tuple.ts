/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTuple} from '../_deepkit/src/reflection/type';
import {CollectionRunType} from '../baseRunTypes';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';
import {JitContext, MockContext, Mutable, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {getJitErrorPath, getExpected, shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
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
        this.childRunTypes.forEach((p, i) => ((p as Mutable<TupleMemberRunType>).memberIndex = i));
    }

    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const compC = (childCtx) => this.childRunTypes.map((rt) => rt.compileIsType(childCtx)).join(' && ');
            return `(Array.isArray(${varName}) && ${varName}.length <= ${this.childRunTypes.length} && (${compileChildren(compC, this, ctx)}))`;
        };
        return handleCircularIsType(compile, this, ctx, false);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const errorsName = ctx.args.εrrors;
            const compC = (childCtx) => this.childRunTypes.map((rt) => rt.compileTypeErrors(childCtx)).join(';');
            const itemsCode = compileChildren(compC, this, ctx);
            return `
                if (!Array.isArray(${varName}) || ${varName}.length > ${this.childRunTypes.length}) {
                    ${errorsName}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}});
                } else {
                    ${itemsCode}
                }
            `;
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        if (shouldSkipJsonEncode(this)) return '';
        const compile = () => {
            const compC = (childCtx) => {
                const childrenCode = this.childRunTypes.map((rt) => rt.compileJsonEncode(childCtx));
                return childrenCode.filter((code) => !!code).join(';');
            };
            return compileChildren(compC, this, ctx);
        };
        return handleCircularJsonEncode(compile, this, ctx);
    }
    compileJsonDecode(ctx: JitContext): string {
        if (shouldSkipJsonDecode(this)) return ctx.args.vλl;
        const compile = () => {
            const compC = (childCtx) => {
                const decodeCodes = this.childRunTypes.map((rt) => rt.compileJsonDecode(childCtx));
                return decodeCodes.filter((code) => !!code).join(';');
            };
            return compileChildren(compC, this, ctx);
        };
        return handleCircularJsonDecode(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx) => {
                const jsonStrings = this.childRunTypes.map((rt) => rt.compileJsonStringify(childCtx));
                return jsonStrings.join(`+','+`);
            };
            return `'['+${compileChildren(compC, this, ctx)}+']'`;
        };
        return handleCircularJsonStringify(compile, this, ctx, false);
    }
    mock(ctx?: Pick<MockContext, 'tupleOptions'>): any[] {
        return this.childRunTypes.map((rt, i) => rt.mock(ctx?.tupleOptions?.[i]));
    }
}
