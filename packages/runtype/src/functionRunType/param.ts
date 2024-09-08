/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeParameter} from '../_deepkit/src/reflection/type';
import {MemberRunType} from '../baseRunTypes';
import {compileChildren} from '../jitCompiler';
import {JitContext, JitPathItem, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode} from '../utils';
import {RestParamsRunType} from './restParams';

export class ParameterRunType extends MemberRunType<TypeParameter> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly memberType: RunType | RestParamsRunType;
    public readonly default: any;
    public readonly memberIndex: number = 0;
    get isRest(): boolean {
        return this.memberType instanceof RestParamsRunType;
    }
    get isOptional(): boolean {
        return !!this.src.optional || this.isRest;
    }
    get memberName(): string {
        return this.src.name;
    }
    get jitId(): string {
        if (this.isRest) return this.memberType.jitId as string;
        return `${this.src.kind}${this.isOptional ? '?' : ''}:${this.memberType.jitId}`;
    }
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypeParameter,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, [...parents, this], opts);
        parents.pop();
        this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
        this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
    }
    getName(): string {
        return `${this.memberName}${this.isOptional ? '?' : ''}:${this.memberType.getName()}`;
    }
    compileIsType(ctx: JitContext): string {
        if (this.isRest) {
            return this.memberType.compileIsType(ctx);
        } else {
            const varName = ctx.args.vλl;
            const childPath: JitPathItem = {vλl: this.memberIndex, useArrayAccessor: true};
            const compC = (childCtx: JitContext) => this.memberType.compileIsType(childCtx);
            const itemCode = compileChildren(compC, this, ctx, childPath);
            return this.isOptional ? `${varName} === undefined || (${itemCode})` : itemCode;
        }
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        if (this.isRest) {
            return this.memberType.compileTypeErrors(ctx);
        } else {
            const varName = ctx.args.vλl;
            const childPath: JitPathItem = {vλl: this.memberIndex, useArrayAccessor: true};
            const compC = (childCtx: TypeErrorsContext) => this.memberType.compileTypeErrors(childCtx);
            const itemCode = compileChildren(compC, this, ctx, childPath);
            return this.isOptional ? `if (${varName} !== undefined) {${itemCode}}` : itemCode;
        }
    }
    compileJsonEncode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, true);
    }
    compileJsonDecode(ctx: JitContext): string {
        return this.compileJsonDE(ctx, false);
    }
    private compileJsonDE(ctx: JitContext, isEncode = false): string {
        const compileFn = isEncode ? this.memberType.compileJsonEncode : this.memberType.compileJsonDecode;
        if (this.isRest) {
            return compileFn(ctx);
        } else {
            const varName = ctx.args.vλl;
            const shouldSkip = isEncode ? shouldSkipJsonEncode(this) : shouldSkipJsonDecode(this);
            if (shouldSkip) return `${varName}[${this.memberIndex}]`;
            const childPath: JitPathItem = {vλl: this.memberIndex, useArrayAccessor: true};
            return compileChildren((childCtx: JitContext) => compileFn(childCtx), this, ctx, childPath);
        }
    }
    compileJsonStringify(ctx: JitContext): string {
        if (this.isRest) {
            return this.memberType.compileJsonStringify(ctx);
        } else {
            const childPath: JitPathItem = {vλl: this.memberIndex, useArrayAccessor: true};
            const compC = (childCtx: JitContext) => {
                const childVarName = childCtx.args.vλl;
                const argCode = this.memberType.compileJsonStringify(childCtx);
                const isFirst = this.memberIndex === 0;
                const sep = isFirst ? '' : `','+`;
                if (this.isOptional) return `(${childVarName} === undefined ? '': ${sep}${argCode})`;
                return `${sep}${argCode}`;
            };
            return compileChildren(compC, this, ctx, childPath);
        }
    }
    mock(ctx?: MockContext): any {
        return this.memberType.mock(ctx);
    }
}
