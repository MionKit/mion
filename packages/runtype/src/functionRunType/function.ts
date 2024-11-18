/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import {ReflectionKind, TypeFunction} from '../_deepkit/src/reflection/type';
import {BaseRunType} from '../baseRunTypes';
import {isAnyFunctionRunType, isFunctionRunType, isPromiseRunType} from '../guards';
import {JitCompiler, JitErrorsCompiler} from '../jitCompiler';
import {MockOperation, DKwithRT, JitConstants, AnyFunction, JitFnID} from '../types';
import {FunctionParametersRunType} from '../collectionRunType/functionParameters';
import {getExpected, getJitErrorPath, toLiteral} from '../utils';
import {PromiseRunType} from '../memberRunType/promise';

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
    getFnName(): string | number {
        const name = (this.src as TypeFunction).name;
        if (!name) return '';
        if (typeof name === 'symbol') return name.toString();
        return name;
    }
    /**
     * returns the number of parameters of the function, follows same logic as Function.prototype.length
     * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Function/length
     * @returns
     */
    getLength(): number {
        return this.parameterRunTypes.getLength();
    }

    createJitParamsFunction(fnId: JitFnID): (...args: any[]) => any {
        return this.parameterRunTypes.createJitFunction(fnId);
    }
    createJitReturnFunction(fnId: JitFnID): (...args: any[]) => any {
        let currentType: PromiseRunType | FunctionRunType<any> = this; // eslint-disable-line @typescript-eslint/no-this-alias
        // iterate over the return type chain until we reach a non-function non-promise type
        // eslint-disable-next-line no-constant-condition
        while (true) {
            if (isAnyFunctionRunType(currentType)) {
                const returnType = currentType.getReturnType();
                if (isPromiseRunType(returnType) || isFunctionRunType(returnType)) {
                    currentType = returnType;
                    continue;
                }
                return returnType.createJitFunction(fnId);
            }
            const memberType = currentType.getMemberType();
            if (isPromiseRunType(memberType) || isFunctionRunType(memberType)) {
                currentType = memberType;
                continue;
            }
            return memberType.createJitFunction(fnId);
        }
    }

    // ######## JIT functions (all throw error) ########

    // can't know the types of the runtype function parameters, neither the return type, so only compare function name and length
    _compileIsType(cop: JitCompiler): string {
        const fnName = this.getFnName();
        const nameCheck = fnName ? ` && ${cop.vλl}.name === ${toLiteral(fnName)}` : '';
        return `typeof ${cop.vλl} === 'function'  && ${cop.vλl}.length === ${this.parameterRunTypes.getLength()} ${nameCheck}`;
    }
    _compileTypeErrors(cop: JitErrorsCompiler): string {
        return `if (!(${this._compileIsType(cop)})) µTils.errPush(${cop.args.εrr},${getJitErrorPath(cop)},${getExpected(this)});`;
    }
    /**
     * json encode a function
     */
    _compileJsonEncode(): string {
        throw new Error(`Compile function JsonEncode not supported, call compileParams or compileReturn instead.`);
    }
    _compileJsonDecode(): string {
        throw new Error(`Compile function JsonDecode not supported, call compileParams or compileReturn instead.`);
    }
    _compileJsonStringify(): string {
        throw new Error(`Compile function JsonStringify not supported, call compileParams or compileReturn instead.`);
    }
    _compileHasUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeyErrors(): string {
        return '';
    }
    _compileStripUnknownKeys(): string {
        return '';
    }
    _compileUnknownKeysToUndefined(): string {
        return '';
    }

    // TODO: paramsSlice has been removed as options are not jet passed when building the run type. maybe we can pass it to the JitCompileOperation instead
    // constructor() {
    //     const start = opts?.paramsSlice?.start;
    //     const end = opts?.paramsSlice?.end;
    //     parameterRunTypes = src.parameters.slice(start, end).map((p) => visitor(p, parents, opts)) as ParameterRunType[];
    // }
    getReturnType(): BaseRunType {
        return (this.src.return as DKwithRT)._rt as BaseRunType;
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
    _mock(): any[] {
        throw new Error('Function Mock is not allowed, call mockParams or mockReturn instead.');
    }
    mockReturn(ctx?: MockOperation): any {
        return this.getReturnType().mock(ctx);
    }
    mockParams(ctx?: MockOperation): any[] {
        return this.parameterRunTypes.mock(ctx);
    }
}
