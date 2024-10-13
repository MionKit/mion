/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {BaseRunType, CollectionRunType} from '../baseRunTypes';
import {isPromiseRunType} from '../guards';
import {JITCompiledFunctions, MockContext, RunType, DKwithRT, JitConstants} from '../types';
import {getJitErrorPath, memo, toLiteral} from '../utils';
import {ParameterRunType} from '../memberRunType/param';
import {JitCompileOp, JitTypeErrorCompileOp} from '../jitOperation';

type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export class FunctionParametersRunType<CallType extends AnyFunction = TypeFunction> extends CollectionRunType<CallType> {
    src: CallType = null as any; // will be set after construction
    getName(): string {
        return 'fnParams';
    }
    getJitChildrenPath(): null {
        throw new Error('Method not implemented.');
    }
    getChildRunTypes = (): RunType[] => {
        const childTypes = (this.src.parameters as DKwithRT[]) || []; // deepkit stores child types in the types property
        return childTypes.map((t) => t._rt);
    };
    getParameterTypes(): ParameterRunType[] {
        return this.getChildRunTypes() as ParameterRunType[];
    }
    getTotalParams(): number {
        return this.getParameterTypes().length;
    }
    hasOptionalParameters(): boolean {
        return this.getParameterTypes().some((p) => p.isOptional());
    }
    hasRestParameter(): boolean {
        return !!this.getParameterTypes().length && this.getParameterTypes()[this.getParameterTypes().length - 1].isRest();
    }
    paramsLiteral(): string {
        return toLiteral(
            `[${this.getParameterTypes()
                .map((p) => p.getName())
                .join(', ')}]`
        );
    }
    getTotalRequiredParams = memo((): number => {
        return this.getParameterTypes().filter((p) => !p.isOptional()).length;
    });
    // ####### params #######

    _compileIsType(cop: JitCompileOp) {
        if (this.getParameterTypes().length === 0) return `${cop.vλl}.length === 0`;
        const paramsCode = this.getParameterTypes()
            .map((p) => `(${p.compileIsType(cop)})`)
            .join(' && ');
        const maxLength = !this.hasRestParameter ? `&& ${cop.vλl}.length <= ${this.getParameterTypes().length}` : '';
        const checkLength = `${cop.vλl}.length >= ${this.getTotalRequiredParams()} ${maxLength}`;
        return `${checkLength} && ${paramsCode}`;
    }
    _compileTypeErrors(cop: JitTypeErrorCompileOp) {
        const maxLength = !this.hasRestParameter ? `|| ${cop.vλl}.length > ${this.getParameterTypes().length}` : '';
        const checkLength = `(${cop.vλl}.length < ${this.getTotalRequiredParams()} ${maxLength})`;
        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileTypeErrors(cop))
            .join(';');
        return (
            `if (!Array.isArray(${cop.vλl}) || ${checkLength}) ${cop.args.εrrors}.push({path: ${getJitErrorPath(cop)}, expected: ${this.paramsLiteral()}});` +
            `else {${paramsCode}}`
        );
    }
    _compileJsonEncode(cop: JitCompileOp) {
        return this.compileParamsJsonDE(cop, true);
    }
    _compileJsonDecode(cop: JitCompileOp) {
        return this.compileParamsJsonDE(cop, false);
    }
    _compileJsonStringify(cop: JitCompileOp) {
        const skip = this.getJitConstants().skipJit;
        if (skip) return '';
        if (this.getParameterTypes().length === 0) return `[]`;

        const paramsCode = this.getParameterTypes()
            .map((p) => p.compileJsonStringify(cop))
            .join('+');
        return `'['+${paramsCode}+']'`;
    }

    private compileParamsJsonDE(cop: JitCompileOp, isEncode: boolean) {
        const skip = isEncode ? this.getJitConstants().skipJsonEncode : this.getJitConstants().skipJsonDecode;
        if (skip) return '';
        return this.getParameterTypes()
            .filter((p) => (isEncode ? p.compileJsonEncode : p.compileJsonDecode))
            .map((p) => (isEncode ? p.compileJsonEncode(cop) : p.compileJsonDecode(cop)))
            .join(';');
    }

    mock(ctx?: MockContext) {
        return this.getParameterTypes().map((p) => p.mock(ctx));
    }
}

const functionJitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
    isCircularRef: false,
    jitId: ReflectionKind.function,
};

export class FunctionRunType<CallType extends AnyFunction = TypeFunction> extends BaseRunType<CallType> {
    private _src: CallType = null as any; // will be set after construction
    private parameterRunTypes: FunctionParametersRunType = null as any;
    set src(src: CallType) {
        this._src = src;
        this.parameterRunTypes = new FunctionParametersRunType();
        (this.parameterRunTypes as any).src = src;
    }
    get src(): CallType {
        return this._src;
    }
    getJitConstants = (): JitConstants => functionJitConstants;
    getFamily(): 'F' {
        return 'F';
    }
    _compileIsType(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    _compileTypeErrors(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    _compileJsonEncode(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    _compileJsonDecode(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    _compileJsonStringify(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }

    // TODO: paramsSlice has been removed as options are not jet passed when building the run type. maybe we can pass it to the JitCompileOperation instead
    // constructor() {
    //     const start = opts?.paramsSlice?.start;
    //     const end = opts?.paramsSlice?.end;
    //     parameterRunTypes = src.parameters.slice(start, end).map((p) => visitor(p, parents, opts)) as ParameterRunType[];
    // }
    getName(): string {
        switch (this.src.kind) {
            case ReflectionKind.function:
                return 'function';
            case ReflectionKind.method:
                return 'method';
            case ReflectionKind.callSignature:
                return 'call';
            case ReflectionKind.methodSignature:
                return 'method';
            default:
                return 'function';
        }
    }
    getReturnType(): RunType {
        return (this.src.return as DKwithRT)._rt;
    }
    getParameters(): FunctionParametersRunType {
        return this.parameterRunTypes;
    }
    hasReturnData(): boolean {
        const returnKind = this.getReturnType().src.kind;
        return (
            returnKind !== ReflectionKind.void && returnKind !== ReflectionKind.never && returnKind !== ReflectionKind.undefined
        );
    }
    isAsync(): boolean {
        const returnKind = this.getReturnType().src.kind;
        return (
            returnKind === ReflectionKind.promise || returnKind === ReflectionKind.any || returnKind === ReflectionKind.unknown
        );
    }
    returnIsPromise(): boolean {
        return isPromiseRunType(this.getReturnType());
    }
    mock(): any[] {
        throw new Error('Function Mock is not allowed, call mockParams or mockReturn instead.');
    }

    compileReturn = memo((): JITCompiledFunctions => this.getReturnType().compile());
    compileParams = memo((): JITCompiledFunctions => this.parameterRunTypes.compile());
    mockReturn(ctx?: MockContext): any {
        return this.getReturnType().mock(ctx);
    }
    mockParams(ctx?: MockContext): any[] {
        return this.parameterRunTypes.mock(ctx);
    }
}
