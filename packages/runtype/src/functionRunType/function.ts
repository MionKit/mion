/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {isPromiseRunType} from '../guards';
import {buildJITFunctions, compileChildren} from '../jitCompiler';
import {
    JITCompiledFunctionsData,
    JitCompilerFunctions,
    JitContext,
    MockContext,
    Mutable,
    RunType,
    RunTypeOptions,
    RunTypeVisitor,
    TypeErrorsContext,
} from '../types';
import {getJitErrorPath, toLiteral} from '../utils';
import {ParameterRunType} from './param';

type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export class FunctionRunType<CallType extends AnyFunction = TypeFunction> extends BaseRunType<CallType> {
    public readonly returnType: RunType;
    public readonly parameterTypes: ParameterRunType[];
    public readonly totalRequiredParams: number;
    get shouldSerialize(): boolean {
        return false;
    }
    get isJsonEncodeRequired(): boolean {
        return true;
    }
    get isJsonDecodeRequired(): boolean {
        return true;
    }
    get isReturnJsonEncodedRequired(): boolean {
        return this.returnType.isJsonEncodeRequired;
    }
    get isReturnJsonDecodedRequired(): boolean {
        return this.returnType.isJsonDecodeRequired;
    }
    get isParamsJsonEncodedRequired(): boolean {
        return this.parameterTypes.some((p) => p.isJsonEncodeRequired);
    }
    get isParamsJsonDecodedRequired(): boolean {
        return this.parameterTypes.some((p) => p.isJsonDecodeRequired);
    }
    get hasReturnData(): boolean {
        const returnKind = this.returnType.src.kind;
        return (
            returnKind !== ReflectionKind.void && returnKind !== ReflectionKind.never && returnKind !== ReflectionKind.undefined
        );
    }
    get hasOptionalParameters(): boolean {
        return this.totalRequiredParams < this.parameterTypes.length;
    }
    get isAsync(): boolean {
        const returnKind = this.returnType.src.kind;
        return (
            returnKind === ReflectionKind.promise || returnKind === ReflectionKind.any || returnKind === ReflectionKind.unknown
        );
    }
    get hasRestParameter(): boolean {
        return !!this.parameterTypes.length && this.parameterTypes[this.parameterTypes.length - 1].isRest;
    }
    get paramsName(): string {
        return `[${this.parameterTypes.map((p) => p.getName()).join(', ')}]`;
    }
    get jitId(): string {
        return `${this.src.kind}(${this.parameterTypes.map((p) => p.jitId).join(',')}):${this.returnType.jitId}`;
    }

    constructor(
        visitor: RunTypeVisitor,
        public readonly src: CallType,
        public readonly parents: RunType[],
        public readonly opts: RunTypeOptions
    ) {
        super(visitor, src, parents, opts);
        const start = opts?.paramsSlice?.start;
        const end = opts?.paramsSlice?.end;
        const maybePromiseReturn = visitor(src.return, parents, opts);
        const isPromise = isPromiseRunType(maybePromiseReturn);
        this.returnType = isPromise ? maybePromiseReturn.resolvedType : maybePromiseReturn;
        this.parameterTypes = src.parameters.slice(start, end).map((p) => visitor(p, parents, opts)) as ParameterRunType[];
        this.totalRequiredParams = this.parameterTypes.reduce((acc, p) => acc + (p.isOptional ? 0 : 1), 0);
        this.parameterTypes.forEach((p, i) => ((p as Mutable<ParameterRunType>).memberIndex = i));
    }

    compileIsType(): string {
        throw new Error(`${this.getName()} validation is not supported, instead validate parameters or return type separately.`);
    }
    compileTypeErrors(): string {
        throw new Error(`${this.getName()} validation is not supported, instead validate parameters or return type separately.`);
    }
    compileJsonEncode(): string {
        throw new Error(`${this.getName()} json encode is not supported, instead encode parameters or return type separately.`);
    }
    compileJsonDecode(): string {
        throw new Error(`${this.getName()} json decode is not supported, instead decode parameters or return type separately.`);
    }
    compileJsonStringify(): string {
        throw new Error(
            `${this.getName()} json stringify is not supported, instead stringify parameters or return type separately.`
        );
    }
    mock(): string {
        throw new Error(`${this.getName()} mock is not supported, instead mock parameters or return type separately.`);
    }

    // ####### params #######

    private _jitParamsFns: JITCompiledFunctionsData | undefined;
    get jitParamsFns(): JITCompiledFunctionsData {
        if (this._jitParamsFns) return this._jitParamsFns;
        return (this._jitParamsFns = buildJITFunctions(this, this._paramsJitFunctions));
    }

    private _paramsJitFunctions: JitCompilerFunctions = {
        compileIsType: (ctx: JitContext) => {
            if (this.parameterTypes.length === 0) return `${ctx.args.vλl}.length === 0`;
            const compC = (childCtx) => this.parameterTypes.map((p) => `(${p.compileIsType(childCtx)})`).join(' && ');
            const paramsCode = compileChildren(compC, this, ctx);
            const maxLength = !this.hasRestParameter ? `&& ${ctx.args.vλl}.length <= ${this.parameterTypes.length}` : '';
            const checkLength = `${ctx.args.vλl}.length >= ${this.totalRequiredParams} ${maxLength}`;
            return `${checkLength} && ${paramsCode}`;
        },
        compileTypeErrors: (ctx: TypeErrorsContext) => {
            const maxLength = !this.hasRestParameter ? `|| ${ctx.args.vλl}.length > ${this.parameterTypes.length}` : '';
            const checkLength = `(${ctx.args.vλl}.length < ${this.totalRequiredParams} ${maxLength})`;
            const compC = (childCtx) => this.parameterTypes.map((p) => p.compileTypeErrors(childCtx)).join(';');
            const paramsCode = compileChildren(compC, this, ctx);
            return (
                `if (!Array.isArray(${ctx.args.vλl}) || ${checkLength}) ${ctx.args.εrrors}.push({path: ${getJitErrorPath(ctx.path)}, expected: ${toLiteral(this.paramsName)}});` +
                `else {${paramsCode}}`
            );
        },
        compileJsonEncode: (ctx: JitContext) => {
            return this.compileParamsJsonDE(ctx, true);
        },
        compileJsonDecode: (ctx: JitContext) => {
            return this.compileParamsJsonDE(ctx, false);
        },
        compileJsonStringify: (ctx: JitContext) => {
            if (this.parameterTypes.length === 0) return `[]`;
            const compC = (childCtx) => this.parameterTypes.map((p) => p.compileJsonStringify(childCtx)).join('+');
            const paramsCode = compileChildren(compC, this, ctx);
            return `'['+${paramsCode}+']'`;
        },
    };

    private compileParamsJsonDE(ctx: JitContext, isEncode: boolean) {
        const isEncRequired = isEncode ? this.isParamsJsonEncodedRequired : this.isParamsJsonDecodedRequired;
        if (!this.opts?.strictJSON && !isEncRequired) return '';
        const compC = (childCtx) => {
            return this.parameterTypes
                .filter((p) => (isEncode ? p.isJsonEncodeRequired : p.isJsonDecodeRequired))
                .map((p) => (isEncode ? p.compileJsonEncode(childCtx) : p.compileJsonDecode(childCtx)))
                .join(';');
        };
        return compileChildren(compC, this, ctx);
    }

    paramsMock(ctx?: MockContext): any[] {
        return this.parameterTypes.map((p) => p.mock(ctx));
    }

    // ####### return #######

    private _jitReturnFns: JITCompiledFunctionsData | undefined;
    get jitReturnFns(): JITCompiledFunctionsData {
        if (this._jitReturnFns) return this._jitReturnFns;
        return (this._jitReturnFns = buildJITFunctions(this, this._returnJitFunctions));
    }

    private _returnJitFunctions: JitCompilerFunctions = {
        compileIsType: (ctx: JitContext) => {
            return compileChildren((childCtx) => this.returnType.compileIsType(childCtx), this, ctx);
        },
        compileTypeErrors: (ctx: TypeErrorsContext) => {
            return compileChildren((childCtx) => this.returnType.compileTypeErrors(childCtx), this, ctx);
        },
        compileJsonEncode: (ctx: JitContext) => {
            if (!this.opts?.strictJSON && !this.isReturnJsonEncodedRequired) return '';
            return compileChildren((childCtx) => this.returnType.compileJsonEncode(childCtx), this, ctx);
        },
        compileJsonDecode: (ctx: JitContext) => {
            if (!this.opts?.strictJSON && !this.isReturnJsonDecodedRequired) return '';
            return compileChildren((childCtx) => this.returnType.compileJsonDecode(childCtx), this, ctx);
        },
        compileJsonStringify: (ctx: JitContext) =>
            compileChildren((childCtx) => this.returnType.compileJsonStringify(childCtx), this, ctx),
    };

    returnMock(ctx?: MockContext): any {
        return this.returnType.mock(ctx);
    }
}
