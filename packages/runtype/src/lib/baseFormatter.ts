/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from './baseRunTypes';
import {createJitCompiler, type JitCompiler, type JitErrorsCompiler} from './jitCompiler';
import type {
    TypeFormatParams,
    JitFnID,
    MockOperation,
    Mutable,
    JitCompiled,
    PureFunctionWithClosure,
    TypeFormatValue,
    StrNumber,
    jitCode,
} from '../types';
import {jitFnHasReturn, jitFnIsExpression, JitFunctions} from '../constants';
import {ReflectionKind} from '@deepkit/type';
import {compileAddPureFunctionContext, dependenciesToLiteral, getFormatterParams, paramsToLiteral} from './formats';
import {jitUtils} from './jitUtils';
import {getFormatterHash} from './utils';

export abstract class JitRunTypeFormatter<P extends TypeFormatParams = any> {
    abstract kind: ReflectionKind;
    abstract name: string;
    rootFormatName: string = '';
    jitFnHasReturn(fnId: JitFnID) {
        return jitFnHasReturn(fnId);
    }
    jitFnIsExpression(fnId: JitFnID) {
        return jitFnIsExpression(fnId);
    }
    jitFnInlined(fnId: JitFnID, rt: BaseRunType): boolean {
        // getFormatterJitId is similar to convert params to string
        const paramsToString = rt.getFormatterJitId() || '';
        // if there are many params, is better to not inline the formatter so the formatter function can be reused
        // in the future we could optimize this logic, to decide if a formatter should be inlined or not
        return paramsToString.length < 200;
    }

    /** Params from parent formatter */
    readonly paramsFromParent?: P;
    /**
     * When set this is the path to the params in the parent's params object.
     * ie: if dateTime is the parent of the current formatter and params are {date: {format: 'ISO'}} then the child path will be ['date']
     */
    readonly parentPath?: (string | number)[];
    /** List of params that will be excluded from jit code */
    readonly extraPathLiteral?: StrNumber;

    private pushContext(paramsFromParent?: P, parentPath?: (string | number)[]) {
        (this as Mutable<JitRunTypeFormatter>).paramsFromParent = paramsFromParent;
        (this as Mutable<JitRunTypeFormatter>).parentPath = parentPath;
    }

    private popContext() {
        (this as Mutable<JitRunTypeFormatter>).paramsFromParent = undefined;
        (this as Mutable<JitRunTypeFormatter>).parentPath = undefined;
    }

    getParams(rt: BaseRunType): NonNullable<P> {
        if (this.paramsFromParent) return this.paramsFromParent as NonNullable<P>;
        const params = getFormatterParams(rt, this.name) as NonNullable<P>;
        return params;
    }

    getFormatName(): string {
        return this.rootFormatName || this.name;
    }

    /** Returns the path to the params in the parent's params object */
    getFormatPath(paramName?: string | number): (string | number)[] {
        if (!paramName) return this.parentPath || [];
        return this.parentPath ? [...this.parentPath, paramName] : [paramName];
    }

    getFormatExtraPathLiteral(): StrNumber | undefined {
        return this.extraPathLiteral;
    }

    getIgnoredProps(): string[] | undefined {
        return undefined;
    }

    mock(mockContext: MockOperation, rt: BaseRunType, params?: P, parentPath?: string[]): any {
        if (this.validateParams) this.validateParams(rt, params || this.getParams(rt));
        this.pushContext(params, parentPath);
        const result = this._mock(mockContext, rt);
        this.popContext();
        return result;
    }

    createJitCompiledFormatter(
        fnId: JitFnID,
        comp: JitCompiler,
        rt: BaseRunType,
        params?: P,
        parentPath?: (string | number)[],
        vλl?: string,
        formatName?: string
    ): JitCompiled {
        const hash = getFormatterHash(rt);
        // created function will be an aux function prefixed with the original function id
        // this is because the new jit function itself is a standalone function  and we don't want it colliding with any other jit function
        const jitFnHash = `${JitFunctions.aux.id}_${fnId}_${hash}`;
        const jitCompiled = jitUtils.getJIT(jitFnHash);
        if (jitCompiled) {
            if (process.env.DEBUG_JIT) console.log(`\x1b[32m Using cached function: ${jitCompiled.jitFnHash} \x1b[0m`);
            return jitCompiled;
        }
        // TODO: decide if we should add parent compiler or not as parent to createJitCompiler
        const newJitCompiler: JitCompiler = createJitCompiler(rt, fnId, undefined, jitFnHash, hash) as JitCompiler;
        try {
            const formatterCode = this._compile(fnId, newJitCompiler, rt, params, parentPath, vλl, formatName);
            const withReturn = this.handleReturnValues(newJitCompiler, fnId, formatterCode || '');
            newJitCompiler.compile(withReturn);
            comp.updateDependencies(newJitCompiler as JitCompiled);
        } catch (e) {
            // if something goes wrong during compilation we want to remove the compiler from
            // the cache as this is automatically added to jitUtils cache during compilation
            newJitCompiler.removeFromJitCache();
            throw e;
        }

        return newJitCompiler as JitCompiled;
    }

    _compile(
        fnId: JitFnID,
        comp: JitCompiler,
        rt: BaseRunType,
        params?: P,
        parentPath?: (string | number)[],
        vλl?: string,
        formatName?: string,
        extraPathLiteral?: StrNumber
    ) {
        if (this.validateParams) this.validateParams(rt, params || this.getParams(rt));
        (this as Mutable<JitRunTypeFormatter>).extraPathLiteral = extraPathLiteral;
        const v = comp.vλl;
        comp.vλl = vλl || v;
        this.rootFormatName = formatName || this.name;
        this.pushContext(params, parentPath);
        let result: jitCode;
        switch (fnId) {
            case JitFunctions.isType.id:
                result = this._compileIsType(comp, rt);
                break;
            case JitFunctions.typeErrors.id:
                result = this._compileTypeErrors(comp as JitErrorsCompiler, rt);
                break;
            case JitFunctions.format.id:
                result = this._compileFormat ? this._compileFormat(comp, rt) : undefined;
                break;
            default:
                throw new Error(`Method not implemented: ${fnId}`);
        }
        this.popContext();
        this.rootFormatName = this.name;
        (this as Mutable<JitRunTypeFormatter>).extraPathLiteral = undefined;
        comp.vλl = v;
        return result;
    }

    handleReturnValues(comp: JitCompiler, currentOpId: JitFnID, code: string): string {
        const codeHasReturn: boolean = this.jitFnHasReturn(currentOpId);
        const isExpression: boolean = this.jitFnIsExpression(currentOpId);
        if (isExpression) {
            return codeHasReturn ? code : `return ${code}`;
        }
        if (codeHasReturn) {
            return code;
        }
        // if code is a block and does not have return, we need to make sure
        const lastChar = code.length - 1;
        const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
        const stopChar = hasFullStop ? '' : ';';
        return `${code}${stopChar} return ${comp.returnName}`;
    }

    abstract _mock(mockContext: MockOperation, rt: BaseRunType): any;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): jitCode;
    abstract _compileFormat?(comp: JitCompiler, rt: BaseRunType): jitCode;

    // ###### optional methods for type formatters ########

    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;

    compilePureFunctionCall(
        comp: JitCompiler,
        rt: BaseRunType,
        pureFn: PureFunctionWithClosure,
        params?: TypeFormatValue,
        dependenciesParams?: Record<string, string | PureFunctionWithClosure>
    ): {callCode: string; fnName: string; paramsName: string; dependenciesName?: string} {
        // PureFunction arguments =>

        // val: any
        // formatParams: TypeFormatValue,
        // deps: PureFunctionDeps

        const val = comp.vλl;
        const paramsName = paramsToLiteral(comp, params || this.getParams(rt), this.getIgnoredProps());
        const dependenciesName = dependenciesToLiteral(comp, dependenciesParams || {});
        const callParams = [val, paramsName, dependenciesName];
        const fnName = compileAddPureFunctionContext(comp, pureFn);
        const callCode = `${fnName}(${callParams.join(',')})`;
        return {callCode, fnName, paramsName, dependenciesName};
    }

    compileErrorsPureFunctionCall(
        comp: JitErrorsCompiler,
        rt: BaseRunType,
        pureFn: PureFunctionWithClosure,
        params: TypeFormatValue,
        dependenciesParams?: Record<string, string | PureFunctionWithClosure>,
        extraPathLiteral?: StrNumber // TODO: this might not be needed
    ): {callCode: string; fnName: string; paramsName: string; dependenciesName?: string} {
        // ErrorsPureFunction arguments =>

        // val: any,
        // pλth: StrNumber[],
        // εrr: RunTypeError[],
        // expected: string,

        // formatName: string,
        // formatParams: P,
        // formatPath: StrNumber[],
        // deps: PureFunctionDeps,
        // accessPath?: StrNumber[]

        const val = comp.vλl;
        const path = comp.args.pλth;
        const err = comp.args.εrr;
        const expected = paramsToLiteral(comp, rt.getKindName());

        const formatName = paramsToLiteral(comp, this.getFormatName());
        const formatParams = paramsToLiteral(comp, params, this.getIgnoredProps());
        const formatPath = paramsToLiteral(comp, this.getFormatPath());
        const deps = dependenciesToLiteral(comp, dependenciesParams || {});
        const accessPath = comp.getAccessPathLiteral(extraPathLiteral);

        const callParams = [val, path, err, expected, formatName, formatParams, formatPath, deps];
        if (accessPath) callParams.push(accessPath);

        const fnName = compileAddPureFunctionContext(comp, pureFn);
        const callCode = `${fnName}(${callParams.join(',')})`;
        return {callCode, fnName, paramsName: formatParams, dependenciesName: deps};
    }

    getCallJitFormatErr(
        comp: JitErrorsCompiler,
        expected: BaseRunType<any>,
        formatter: JitRunTypeFormatter<any>,
        shouldReturn = false,
        extraPathLiteral?: StrNumber
    ) {
        return (paramName: string, paramValue: StrNumber) => {
            const callCode = comp.callJitFormatErr(expected, formatter, paramName, paramValue, extraPathLiteral);
            if (shouldReturn) return `return ${callCode}, ${comp.args.εrr}`;
            return callCode;
        };
    }
}
