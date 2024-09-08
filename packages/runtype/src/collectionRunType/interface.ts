/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {TypeObjectLiteral, TypeClass, TypeIntersection} from '../_deepkit/src/reflection/type';
import {JitContext, MockContext, Mutable, RunType, RunTypeOptions, RunTypeVisitor, TypeErrorsContext} from '../types';
import {shouldSkipJsonDecode, shouldSkipJsonEncode, getJitErrorPath, getExpected} from '../utils';
import {PropertyRunType} from './property';
import {CollectionRunType} from '../baseRunTypes';
import {MethodSignatureRunType} from '../functionRunType/methodSignature';
import {CallSignatureRunType} from '../functionRunType/call';
import {IndexSignatureRunType} from './indexProperty';
import {MethodRunType} from '../functionRunType/method';
import {
    handleCircularIsType,
    handleCircularJsonDecode,
    handleCircularJsonEncode,
    handleCircularJsonStringify,
    handleCircularTypeErrors,
} from '../jitCircular';
import {compileChildren} from '../jitCompiler';

export type InterfaceRunTypeEntry =
    | PropertyRunType
    | MethodSignatureRunType
    | CallSignatureRunType
    | IndexSignatureRunType
    | MethodRunType;

export class InterfaceRunType<
    T extends TypeObjectLiteral | TypeClass | TypeIntersection = TypeObjectLiteral,
> extends CollectionRunType<T> {
    public readonly isJsonEncodeRequired: boolean;
    public readonly isJsonDecodeRequired: boolean;
    public readonly entries: InterfaceRunTypeEntry[];
    public readonly childRunTypes: (PropertyRunType | IndexSignatureRunType)[];
    public readonly jitId: string = '$';
    constructor(
        visitor: RunTypeVisitor,
        public readonly src: T,
        public readonly parents: RunType[],
        opts: RunTypeOptions,
        isJsonDecodeRequired = false,
        isJsonEncodeRequired = false
    ) {
        super(visitor, src, parents, opts);
        parents.push(this);
        this.entries = src.types.map((type) => visitor(type, parents, opts)) as typeof this.entries;
        parents.pop();
        this.isJsonDecodeRequired = isJsonDecodeRequired || this.entries.some((prop) => prop.isJsonDecodeRequired);
        this.isJsonEncodeRequired = isJsonEncodeRequired || this.entries.some((prop) => prop.isJsonEncodeRequired);
        this.childRunTypes = this.entries.filter((prop) => prop.shouldSerialize) as (PropertyRunType | IndexSignatureRunType)[];
        this.jitId = `${this.src.kind}{${this.childRunTypes.map((prop) => prop.jitId).join(',')}}`;
        this.childRunTypes.forEach((p, i) => ((p as Mutable<PropertyRunType | IndexSignatureRunType>).memberIndex = i));
    }

    compileIsType(ctx: JitContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const compC = (childCtx: JitContext) => this.childRunTypes.map((prop) => prop.compileIsType(childCtx)).join(' && ');
            return `(typeof ${varName} === 'object' && ${varName} !== null && !Array.isArray(${varName}) && ${compileChildren(compC, this, ctx)})`;
        };
        return handleCircularIsType(compile, this, ctx, false);
    }
    compileTypeErrors(ctx: TypeErrorsContext): string {
        const compile = () => {
            const varName = ctx.args.vλl;
            const errorsName = ctx.args.εrrors;
            const compC = (childCtx: TypeErrorsContext) =>
                this.childRunTypes.map((prop) => prop.compileTypeErrors(childCtx)).join(';');
            return `
                if (typeof ${varName} !== 'object' && ${varName} !== null && !Array.isArray(${varName})) {
                    ${errorsName}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${getExpected(this)}});
                } else {
                    ${compileChildren(compC, this, ctx)}
                }
            `;
        };
        return handleCircularTypeErrors(compile, this, ctx);
    }
    compileJsonEncode(ctx: JitContext): string {
        if (shouldSkipJsonEncode(this)) return '';
        const compile = () => {
            const compC = (childCtx: JitContext) => {
                return this.childRunTypes.map((prop) => prop.compileJsonEncode(childCtx)).join(';');
            };
            return compileChildren(compC, this, ctx);
        };
        return handleCircularJsonEncode(compile, this, ctx);
    }
    compileJsonDecode(ctx: JitContext): string {
        if (shouldSkipJsonDecode(this)) return '';
        const compile = () => {
            const compC = (childCtx: JitContext) => {
                return this.childRunTypes.map((prop) => prop.compileJsonDecode(childCtx)).join(';');
            };
            return compileChildren(compC, this, ctx);
        };
        return handleCircularJsonDecode(compile, this, ctx);
    }
    compileJsonStringify(ctx: JitContext): string {
        const compile = () => {
            const compC = (childCtx: JitContext) =>
                this.childRunTypes.map((prop) => prop.compileJsonStringify(childCtx)).join('+');
            return `'{'+${compileChildren(compC, this, ctx)}+'}'`;
        };
        return handleCircularJsonStringify(compile, this, ctx, false);
    }
    mock(ctx?: Pick<MockContext, 'parentObj'>): Record<string | number, any> {
        const obj: Record<string | number, any> = ctx?.parentObj || {};
        this.childRunTypes.forEach((prop) => {
            const name: string | number = prop.memberName as any;
            if (prop instanceof IndexSignatureRunType) prop.mock(ctx);
            else obj[name] = prop.mock(ctx as MockContext);
        });
        return obj;
    }
}
