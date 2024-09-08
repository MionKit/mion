/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeTupleMember} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';
import {JitContext, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';

export class TupleMemberRunType extends MemberRunType<TypeTupleMember> {
    public readonly memberType: RunType;
    public readonly memberName: string | number;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';
    public readonly memberIndex: number = 0;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeTupleMember,
        public readonly parents: RunType[],
        public opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        parents.pop();
        this.memberName = src.name || '';
        const optional = this.src.optional ? '?' : '';
        this.jitId = `${this.src.kind}${optional}:${this.memberType.jitId}`;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired || !!this.src.optional;
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired || !!this.src.optional;
    }
    useArrayAccessorForJit() {
        return true;
    }
    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx: JitContext) => this.memberType.compileIsType(childCtx);
            const itemCode = compileChildren(compC, this, ctx, this.memberIndex);
            return this.src.optional ? `(${ctx.args.value} === undefined || ${itemCode})` : itemCode;
        };
        return handleCircularIsType(compile, this, ctx, false);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const compC = (childCtx: TypeErrorsContext) => this.memberType.compileTypeErrors(childCtx);
            const itemCode = compileChildren(compC, this, ctx, this.memberIndex);
            return this.src.optional ? `if (${ctx.args.value} !== undefined) {${itemCode}}` : itemCode;
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        if (shouldSkipJsonEncode(this)) return '';
        const compile = () => {
            const compC = (childCtx: JitContext) => this.memberType.compileJsonEncode(childCtx);
            const itemCode = compileChildren(compC, this, ctx, this.memberIndex);
            return this.src.optional ? `${ctx.args.value} === undefined ? null : ${itemCode}` : itemCode;
        };
        return handleCircularJsonEncode(compile, this, ctx);
    }
    compileJsonDecode(ctx: JitContext): string {
        if (shouldSkipJsonDecode(this)) return '';
        const compile = () => {
            const compC = (childCtx: JitContext) => this.memberType.compileJsonDecode(childCtx);
            const itemCode = compileChildren(compC, this, ctx, this.memberIndex);
            return this.src.optional ? `${ctx.args.value} === null ? undefined : ${itemCode}` : itemCode;
        };
        return handleCircularJsonDecode(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx: JitContext) => this.memberType.compileJsonStringify(childCtx);
            const itemCode = compileChildren(compC, this, ctx, this.memberIndex);
            return this.src.optional ? `(${ctx.args.value} === undefined ? null : ${itemCode})` : itemCode;
        };
        return handleCircularJsonStringify(compile, this, ctx, false);
    }
    mock(ctx?: Pick<MockContext, 'optionalProbability'>): any {
        if (this.src.optional) {
            const probability = ctx?.optionalProbability || 0.5;
            if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
            if (Math.random() < probability) {
                return undefined;
            }
        }
        return this.memberType.mock(ctx);
    }
}
