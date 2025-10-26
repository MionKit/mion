/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {AnyFunction, SrcType, JitFn, JitCode, RunTypeOptions} from '../../types';
import {ReflectionKind, TypeFunction} from '@deepkit/type';
import {BaseRunType} from '../../lib/baseRunTypes';
import {isAnyFunctionRunType, isFunctionRunType, isPromiseRunType} from '../../lib/guards';
import {JitFnCompiler, JitErrorsFnCompiler} from '../../lib/jitFnCompiler';
import {PromiseRunType} from '../native/promise';
import {ReflectionSubKind} from '../../constants.kind';
import {FunctionParamsRunType} from '../collection/functionParams';
import {JitCompiledFn} from '@mionkit/core';
import {registerJitFunctionCompiler} from '../../lib/jitFnsRegistry';
import {JitFunctions} from '../../constants.functions';

export class FunctionRunType<CallType extends AnyFunction = TypeFunction> extends BaseRunType<CallType> {
    // parameterRunTypes.src must be set after FunctionRunType creation
    parameterRunTypes: FunctionParamsRunType = new FunctionParamsRunType();
    skipJit(comp: JitFnCompiler): boolean {
        if (!comp) return true;
        return comp.fnID !== JitFunctions.toJavascript.id;
    }
    onCreated(deepkitType: SrcType): void {
        // here we are mapping parameters from TypeParameter[] to TypeTuple as TupleRunType() is the same functionality as ParameterRunType[]
        super.onCreated(deepkitType);
        // todo the deepkit type is a
        this.parameterRunTypes.onCreated({...deepkitType, subKind: ReflectionSubKind.params});
    }
    _getTypeID() {
        // Only include the name if this function is a property in an object/interface/class
        // We can check the parent to determine this
        const parent = this.src.parent;
        const name = (this.src as TypeFunction)?.name;
        if (name && parent && (parent.kind === ReflectionKind.objectLiteral || parent.kind === ReflectionKind.class)) {
            return `${ReflectionKind.function}${String(name)}`;
        }
        return ReflectionKind.function;
    }
    getFamily(): 'F' {
        return 'F';
    }
    getFnName(): string | number {
        const name = (this.src as TypeFunction).name;
        if (!name) return '';
        if (typeof name === 'symbol') return name.toString();
        return name;
    }
    createJitParamsFunction(jitFn: JitFn, opts?: RunTypeOptions): (...args: any[]) => any {
        return this.createJitCompiledParamsFunction(jitFn, opts).fn;
    }
    createJitCompiledParamsFunction(jitFn: JitFn, opts?: RunTypeOptions): JitCompiledFn {
        const start = opts?.paramsSlice?.start;
        const end = opts?.paramsSlice?.end;
        if (start && end) {
            if (start < 0 || end > this.parameterRunTypes.getChildRunTypes().length)
                throw new Error(`Invalid paramsSlice, start: ${start}, end: ${end}.`);
            if (end <= start) throw new Error(`Invalid paramsSlice, start: ${start}, end: ${end}`);
        }
        return this.parameterRunTypes.createJitCompiledFunction(jitFn.id, undefined, opts);
    }
    createJitReturnFunction(jitFn: JitFn): (...args: any[]) => any {
        return this.createJitCompiledReturnFunction(jitFn).fn;
    }

    createJitCompiledReturnFunction(jitFn: JitFn, opts?: RunTypeOptions): JitCompiledFn {
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
                return returnType.createJitCompiledFunction(jitFn.id, undefined, opts);
            }
            const memberType = currentType.getMemberType();
            if (isPromiseRunType(memberType) || isFunctionRunType(memberType)) {
                currentType = memberType;
                continue;
            }
            return memberType.createJitCompiledFunction(jitFn.id, undefined, opts);
        }
    }

    // ######## JIT functions (all throw error) ########

    // can't know the types of the run type function parameters, neither the return type, so only compare function name and length
    emitIsType(comp: JitFnCompiler): JitCode {
        const minLength = this.parameterRunTypes.totalRequiredParams(comp);
        const totalParams = this.parameterRunTypes.getParamRunTypes(comp).length;
        const hasOptional = totalParams > minLength;
        const maxLength =
            this.parameterRunTypes.hasRestParameter(comp) || !hasOptional ? '' : ` && ${comp.vλl}.length <= ${totalParams}`;
        return {code: `(typeof ${comp.vλl} === 'function' && ${comp.vλl}.length >= ${minLength} ${maxLength})`, type: 'E'};
    }
    emitTypeErrors(comp: JitErrorsFnCompiler): JitCode {
        return {code: `if (!(${this.emitIsType(comp).code})) ${comp.callJitErr(this)};`, type: 'S'};
    }
    /**
     * json encode a function
     */
    emitPrepareForJson(): JitCode {
        throw new Error(`Compile function PrepareForJson not supported, call compileParams or compileReturn instead.`);
    }
    emitRestoreFromJson(): JitCode {
        throw new Error(`Compile function RestoreFromJson not supported, call compileParams or compileReturn instead.`);
    }
    emitHasUnknownKeys(): JitCode {
        return {code: '', type: 'E'};
    }
    emitUnknownKeyErrors(): JitCode {
        return {code: '', type: 'S'};
    }
    emitStripUnknownKeys(): JitCode {
        return {code: '', type: 'S'};
    }
    emitUnknownKeysToUndefined(): JitCode {
        return {code: '', type: 'S'};
    }

    // TODO: paramsSlice has been removed as options are not jet passed when building the run type. maybe we can pass it to the JitCompileOperation instead
    // constructor() {
    //     const start = opts?.paramsSlice?.start;
    //     const end = opts?.paramsSlice?.end;
    //     parameterRunTypes = src.parameters.slice(start, end).map((p) => visitor(p, parents, opts)) as ParameterRunType[];
    // }
    getReturnType(): BaseRunType {
        return (this.src.return as SrcType)._rt as BaseRunType;
    }
    getParameters(): FunctionParamsRunType {
        return this.parameterRunTypes;
    }
    getParameterNames(opts?: RunTypeOptions): string[] {
        const start = opts?.paramsSlice?.start;
        const end = opts?.paramsSlice?.end;
        if (start || end) {
            return this.src.parameters.slice(start, end).map((p) => p.name);
        }
        return this.src.parameters.map((p) => p.name);
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
    async mockReturn(ctx?: RunTypeOptions): Promise<any> {
        await registerJitFunctionCompiler(JitFunctions.mock);
        return this.getReturnType().mockType(ctx);
    }
    async mockParams(ctx?: RunTypeOptions): Promise<any[]> {
        await registerJitFunctionCompiler(JitFunctions.mock);
        return this.parameterRunTypes.mockType(ctx);
    }
}
