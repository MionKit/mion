/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeCallSignature, TypeFunction, TypeMethod, TypeMethodSignature} from '../_deepkit/src/reflection/type';
import {ArrayCollectionRunType, BaseRunType} from '../baseRunTypes';
import {isPromiseRunType} from '../guards';
import {JITCompiledFunctions, JitOperation, MockContext, RunType, JitTypeErrorOperation, DKwithRT, JitConstants} from '../types';
import {getJitErrorPath, memo, toLiteral} from '../utils';
import {ParameterRunType} from '../memberRunType/param';

type AnyFunction = TypeMethodSignature | TypeCallSignature | TypeFunction | TypeMethod;

export class FunctionParametersRunType<CallType extends AnyFunction = TypeFunction> extends ArrayCollectionRunType<CallType> {
    src: CallType = null as any; // will be set after construction
    getName(): string {
        return 'fnParams';
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

    _compileIsType(op: JitOperation) {
        if (this.getParameterTypes().length === 0) return `${op.args.vλl}.length === 0`;
        const compNext = (nextOp) =>
            this.getParameterTypes()
                .map((p) => `(${p.compileIsType(nextOp)})`)
                .join(' && ');
        const paramsCode = this.compileChildren(compNext, op);
        const maxLength = !this.hasRestParameter ? `&& ${op.args.vλl}.length <= ${this.getParameterTypes().length}` : '';
        const checkLength = `${op.args.vλl}.length >= ${this.getTotalRequiredParams()} ${maxLength}`;
        return `${checkLength} && ${paramsCode}`;
    }
    _compileTypeErrors(op: JitTypeErrorOperation) {
        const maxLength = !this.hasRestParameter ? `|| ${op.args.vλl}.length > ${this.getParameterTypes().length}` : '';
        const checkLength = `(${op.args.vλl}.length < ${this.getTotalRequiredParams()} ${maxLength})`;
        const compNext = (nextOp) =>
            this.getParameterTypes()
                .map((p) => p.compileTypeErrors(nextOp))
                .join(';');
        const paramsCode = this.compileChildren(compNext, op);
        return (
            `if (!Array.isArray(${op.args.vλl}) || ${checkLength}) ${op.args.εrrors}.push({path: ${getJitErrorPath(op)}, expected: ${this.paramsLiteral()}});` +
            `else {${paramsCode}}`
        );
    }
    _compileJsonEncode(op: JitOperation) {
        return this.compileParamsJsonDE(op, true);
    }
    _compileJsonDecode(op: JitOperation) {
        return this.compileParamsJsonDE(op, false);
    }
    _compileJsonStringify(op: JitOperation) {
        const skip = this.constants().skipJit;
        if (skip) return '';
        if (this.getParameterTypes().length === 0) return `[]`;
        const compNext = (nextOp) =>
            this.getParameterTypes()
                .map((p) => p.compileJsonStringify(nextOp))
                .join('+');
        const paramsCode = this.compileChildren(compNext, op);
        return `'['+${paramsCode}+']'`;
    }

    private compileParamsJsonDE(op: JitOperation, isEncode: boolean) {
        const skip = isEncode ? this.constants().skipJsonEncode : this.constants().skipJsonDecode;
        if (skip) return '';
        const compNext = (nextOp) => {
            return this.getParameterTypes()
                .filter((p) => (isEncode ? p.compileJsonEncode : p.compileJsonDecode))
                .map((p) => (isEncode ? p.compileJsonEncode(nextOp) : p.compileJsonDecode(nextOp)))
                .join(';');
        };
        return this.compileChildren(compNext, op);
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
    constants = (): JitConstants => functionJitConstants;
    getFamily(): 'F' {
        return 'F';
    }
    compileIsType(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    compileTypeErrors(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    compileJsonEncode(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    compileJsonDecode(): string {
        throw new Error('Compile function not supported, call  compileParams or  compileReturn instead.');
    }
    compileJsonStringify(): string {
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
