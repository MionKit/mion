/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeFunction} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {isPromiseRunType} from '../guards';
import {JITCompiledFunctions, MockContext, RunType, DKwithRT, JitConstants, AnyFunction} from '../types';
import {memo} from '../utils';
import {FunctionParametersRunType} from './functionParameters';

const functionJitConstants: JitConstants = {
    skipJit: true,
    skipJsonEncode: true,
    skipJsonDecode: true,
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
