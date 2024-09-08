/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {TypeProperty, TypePropertySignature} from '../_deepkit/src/reflection/type';
import {JitContext, JitPathItem, MockContext, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {isFunctionKind, shouldSkipJsonDecode, shouldSkipJsonEncode, toLiteral} from '../utils';
import {validPropertyNameRegExp} from '../constants';
import {MemberRunType} from '../baseRunTypes';
import {jitUtils} from '../jitUtils';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';

export class PropertyRunType extends MemberRunType<TypePropertySignature | TypeProperty> {
    public readonly memberType: RunType;
    public readonly isSafePropName: boolean;
    public readonly memberName: string | number;
    public readonly shouldSerialize: boolean;
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly jitId: string = '$';
    public readonly memberIndex: number = 0;
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: TypePropertySignature,
        public readonly parents: RunType[],
        opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.memberType = visitor(src.type, parents, opts);
        parents.pop();

        if (typeof src.name === 'symbol') {
            this.memberName = src.name.toString();
            this.shouldSerialize = false;
            this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired;
            this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        } else {
            this.memberName = src.name;
            this.shouldSerialize = !isFunctionKind(src.kind);
            this.isJsonEncodeRequired = this.memberType.isJsonEncodeRequired && this.shouldSerialize;
            this.isJsonDecodeRequired = this.memberType.isJsonDecodeRequired;
        }
        const optional = this.src.optional ? '?' : '';
        this.isSafePropName =
            (typeof src.name === 'string' && validPropertyNameRegExp.test(src.name)) || typeof src.name === 'number';
        this.jitId = `${this.memberName}${optional}:${this.memberType.jitId}`;
    }
    compileIsType(ctx: JitContext): string {
        if (!this.shouldSerialize) return '';
        const compile = () => {
            const childPath: JitPathItem = this.getChildPath();
            const compC = (childCtx: JitContext) => {
                const childVarName = childCtx.args.vλl;
                const itemCode = this.memberType.compileIsType(childCtx);
                return this.src.optional ? `(${childVarName} === undefined || ${itemCode})` : itemCode;
            };
            return compileChildren(compC, this, ctx, childPath);
        };
        return handleCircularIsType(compile, this, ctx, false);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        if (!this.shouldSerialize) return '';
        const compile = () => {
            const childPath: JitPathItem = this.getChildPath();
            const compC = (childCtx: TypeErrorsContext) => {
                const childVarName = childCtx.args.vλl;
                const itemCode = this.memberType.compileTypeErrors(childCtx);
                return this.src.optional ? `if (${childVarName} !== undefined) {${itemCode}}` : itemCode;
            };
            return compileChildren(compC, this, ctx, childPath);
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        if (!this.shouldSerialize || shouldSkipJsonEncode(this)) return '';
        const compile = () => {
            const childPath: JitPathItem = this.getChildPath();
            const compC = (childCtx: JitContext) => {
                const childVarName = childCtx.args.vλl;
                const propCode = this.memberType.compileJsonEncode(childCtx);
                if (this.src.optional) return `if (${childVarName} !== undefined) ${propCode}`;
                return propCode;
            };
            return compileChildren(compC, this, ctx, childPath);
        };
        return handleCircularJsonEncode(compile, this, ctx);
    }
    compileJsonDecode(ctx: JitContext): string {
        if (!this.shouldSerialize || shouldSkipJsonDecode(this)) return '';
        const compile = () => {
            const childPath: JitPathItem = this.getChildPath();
            const compC = (childCtx: JitContext) => {
                const propCode = this.memberType.compileJsonDecode(childCtx);
                if (this.src.optional) return `if (${childCtx.args.vλl} !== undefined) ${propCode}`;
                return propCode;
            };
            return compileChildren(compC, this, ctx, childPath);
        };
        return handleCircularJsonDecode(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        if (!this.shouldSerialize) return '';
        const compile = () => {
            const childPath: JitPathItem = this.getChildPath();
            const compC = (childCtx: JitContext) => {
                const childVarName = childCtx.args.vλl;
                // when is not safe firs stringify sanitizes string, second output double quoted scaped json string
                const proNameJSon = this.isSafePropName
                    ? `'${toLiteral(this.memberName)}'`
                    : jitUtils.asJSONString(toLiteral(this.memberName));
                const propCode = this.memberType.compileJsonStringify(childCtx);
                // this can´t be processed in the parent as we need to handle the empty string case when value is undefined
                const isFirst = this.memberIndex === 0;
                const sep = isFirst ? '' : `','+`;
                if (this.src.optional) {
                    return `(${childVarName} === undefined ? '' : ${sep}${proNameJSon}+':'+${propCode})`;
                }
                return `${sep}${proNameJSon}+':'+${propCode}`;
            };
            return compileChildren(compC, this, ctx, childPath);
        };
        return handleCircularJsonStringify(compile, this, ctx, false);
    }
    mock(ctx?: Pick<MockContext, 'optionalPropertyProbability' | 'optionalProbability'>): any {
        const probability = ctx?.optionalPropertyProbability?.[this.memberName] ?? ctx?.optionalProbability ?? 0.5;
        if (probability < 0 || probability > 1) throw new Error('optionalProbability must be between 0 and 1');
        if (this.src.optional && Math.random() < probability) return undefined;
        return this.memberType.mock(ctx);
    }

    getChildPath(): JitPathItem {
        return this.isSafePropName
            ? {vλl: this.memberName, useArrayAccessor: false}
            : {vλl: this.memberName, useArrayAccessor: true, literal: toLiteral(this.memberName)};
    }
}
