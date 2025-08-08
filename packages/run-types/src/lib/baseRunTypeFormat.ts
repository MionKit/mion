/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {TypeFormatParams, PureFunctionClosure, TypeFormatValue, JitCompiledFn} from '@mionkit/core/types';
import type {BaseRunType} from './baseRunTypes';
import {compileAddPureFunctionWithClosure, createJitCompiler, type JitCompiler, type JitErrorsCompiler} from './jitCompiler';
import type {JitFnID, Mutable, StrNumber, jitCode, RunTypeOptions} from '../types';
import {getCodeType} from './jitFnsRegistry';
import {CodeType} from '../constants.functions';
import {JitFunctions} from '../constants.functions';
import {ReflectionKind} from '@deepkit/type';
import {dependenciesToLiteral, getFormatterParams, paramsToLiteral} from './formats';
import {jitUtils} from '@mionkit/core/jitUtils';
import {getFormatterHash} from './utils';
import {getENV} from '@mionkit/core/utils';

/**
 * Base class for all RunType formatters.
 * A type format is a type that satisfies some extra constrains, like emails, alphanumeric, uuids etc...
 * All those are formats of string.
 * At the moment only formats for string and numbers are supported.
 * Jit formatters receive some params and generate JIT code depending on these params.
 */
export abstract class BaseRunTypeFormat<P extends TypeFormatParams = any> {
    abstract kind: ReflectionKind;
    abstract name: string;
    rootFormatName: string = '';
    getCodeType(fnID: JitFnID, _rt: BaseRunType, _params?: P): CodeType {
        return getCodeType(fnID);
    }
    /**
     * The jit code for the formatter can be embedded together with the jit code for the type itself.
     * but sometimes is better to create a separate function for code to be reused.
     * This method is used to determine if the formatter code can be embedded or not.
     */
    canEmbedFormatterCode(_fnId: JitFnID, rt: BaseRunType, _params?: P): boolean {
        if (rt.src.kind === ReflectionKind.number) return true;
        // getFormatterJitId is similar to convert params to string
        const paramsToString = rt.getFormatTypeID() || '';
        // if there are many params, is better to not inline the formatter so the formatter function can be reused
        // in the future we could optimize this logic, to decide if a formatter should be embedded or not
        return paramsToString.length < 300;
    }

    /** Params from parent formatter */
    readonly paramsFromParent?: P;
    /**
     * When set this in the path to the params in the parent's params object.
     * ie: if dateTime is the parent of the current formatter and params are {date: {format: 'ISO'}} then the child path will be ['date']
     */
    readonly parentPath?: StrNumber[];
    /** List of params that will be excluded from jit code */
    readonly extraPathLiteral?: StrNumber;

    /**
     * The parentPath is the path to the params in the parent's params Formatter.
     * ie: if dateTime is the parent of the current formatter and params are {date: {format: 'ISO'}} then the child path will be ['date']
     */
    constructor(parentPath?: StrNumber[]) {
        this.parentPath = parentPath;
    }

    private pushContext(paramsFromParent?: P) {
        (this as Mutable<BaseRunTypeFormat>).paramsFromParent = paramsFromParent;
    }

    private popContext() {
        (this as Mutable<BaseRunTypeFormat>).paramsFromParent = undefined;
    }

    isRootFormat() {
        return !this.parentPath?.length;
    }

    getFormatNestLevel() {
        return this.parentPath?.length || 0;
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
    getFormatPath(paramName?: StrNumber): StrNumber[] {
        if (!paramName && this.parentPath) return [...this.parentPath];
        if (!paramName) return [];
        return this.parentPath ? [...this.parentPath, paramName] : [paramName];
    }

    getFormatExtraPathLiteral(): StrNumber | undefined {
        return this.extraPathLiteral;
    }

    getIgnoredProps(): string[] | undefined {
        return undefined;
    }

    mock(opts: RunTypeOptions, rt: BaseRunType, params?: P): any {
        if (this.validateParams) this.validateParams(rt, params || this.getParams(rt));
        this.pushContext(params);
        const result = this._mock(opts, rt);
        this.popContext();
        const formatter = this.createJitCompiledFormatter(JitFunctions.format.id, rt, undefined, params);
        if (formatter.isNoop) return result;
        return formatter.fn(result);
    }

    createJitCompiledFormatter(
        fnID: JitFnID,
        rt: BaseRunType,
        comp?: JitCompiler,
        params?: P,
        vλl?: string,
        formatName?: string,
        opts: RunTypeOptions = {}
    ): JitCompiledFn {
        const hash = getFormatterHash(rt);
        // created function will be an aux function prefixed with the original function id
        // this is because the new jit function itself is a standalone function  and we don't want it colliding with any other jit function
        const jitFnHash = `${JitFunctions.aux.id}_${fnID}_${hash}`;
        const jitCompiled = jitUtils.getJIT(jitFnHash);
        if (jitCompiled) {
            if (getENV('DEBUG_JIT') === 'VERBOSE')
                console.log(`\x1b[32m Using cached function: ${jitCompiled.jitFnHash} \x1b[0m`);
            comp?.updateDependencies(jitCompiled);
            return jitCompiled;
        }
        // TODO: decide if we should add parent compiler or not as parent to createJitCompiler
        const newJitCompiler: JitCompiler = createJitCompiler(rt, fnID, undefined, jitFnHash, hash, opts) as JitCompiler;
        try {
            const formatterCode = this.compileFormat(fnID, newJitCompiler, rt, params, vλl, formatName);
            const withReturn = this.handleReturnValues(rt, newJitCompiler, fnID, formatterCode || '');
            newJitCompiler.compile(withReturn);
            comp?.updateDependencies(newJitCompiler as JitCompiledFn);
        } catch (e) {
            // if something goes wrong during compilation we want to remove the compiler from
            // the cache as this is automatically added to jitUtils cache during compilation
            newJitCompiler.removeFromJitCache();
            throw e;
        }

        return newJitCompiler as JitCompiledFn;
    }

    compileFormat(
        fnID: JitFnID,
        comp: JitCompiler,
        rt: BaseRunType,
        params?: P,
        vλl?: string,
        formatName?: string,
        extraPathLiteral?: StrNumber
    ) {
        if (this.validateParams) this.validateParams(rt, params || this.getParams(rt));
        (this as Mutable<BaseRunTypeFormat>).extraPathLiteral = extraPathLiteral;
        const v = comp.vλl;
        comp.vλl = vλl || v;
        this.rootFormatName = formatName || this.name;
        this.pushContext(params);
        let result: jitCode;
        switch (fnID) {
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
                throw new Error(`Method not implemented: ${fnID}`);
        }
        this.popContext();
        this.rootFormatName = this.name;
        (this as Mutable<BaseRunTypeFormat>).extraPathLiteral = undefined;
        comp.vλl = v;
        return result;
    }

    /**
     * Adds return statements if needed
     * Unlike handleReturnValues in BaseRunType this one is only called in the root of the formatter
     */
    handleReturnValues(rt: BaseRunType, comp: JitCompiler, currentOpId: JitFnID, code: jitCode): string {
        if (!code) return '';
        const codeType = this.getCodeType(currentOpId, rt);
        switch (codeType) {
            case 'E':
                return `return ${code}`;
            case 'RB':
                return code;
            case 'S': {
                // For non-expressions, add a return statement with the default return value
                // if the code doesn't already have a return statement
                const lastChar = code.length - 1;
                const hasFullStop = code.lastIndexOf(';') === lastChar || code.lastIndexOf('}') === lastChar;
                const stopChar = hasFullStop ? '' : ';';
                return `${code}${stopChar} return ${comp.returnName}`;
            }
        }
    }

    abstract _mock(opts: RunTypeOptions, rt: BaseRunType): any;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): jitCode;

    // ###### optional methods for type formatters ########

    /** Optional method to compile the formatter function that transforms/sanitize a value */
    _compileFormat?(comp: JitCompiler, rt: BaseRunType): jitCode;

    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;

    compilePureFunctionCall(
        comp: JitCompiler,
        rt: BaseRunType,
        pureFn: PureFunctionClosure,
        params?: TypeFormatValue,
        dependenciesParams?: Record<string, string | PureFunctionClosure>
    ): {callCode: string; fnName: string; paramsName: string; dependenciesName?: string} {
        // PureFunction arguments =>

        // val: any
        // formatParams: TypeFormatValue,
        // deps: PureFunctionDeps

        const val = comp.vλl;
        const paramsName = paramsToLiteral(comp, params || this.getParams(rt), this.getIgnoredProps());
        const dependenciesName = dependenciesToLiteral(comp, dependenciesParams || {});
        const callParams = [val, paramsName, dependenciesName];
        const fnName = compileAddPureFunctionWithClosure(comp, pureFn);
        const callCode = `${fnName}(${callParams.join(',')})`;
        return {callCode, fnName, paramsName, dependenciesName};
    }

    compileErrorsPureFunctionCall(
        comp: JitErrorsCompiler,
        rt: BaseRunType,
        pureFn: PureFunctionClosure,
        params: TypeFormatValue,
        dependenciesParams?: Record<string, string | PureFunctionClosure>,
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

        const fnName = compileAddPureFunctionWithClosure(comp, pureFn);
        const callCode = `${fnName}(${callParams.join(',')})`;
        return {callCode, fnName, paramsName: formatParams, dependenciesName: deps};
    }

    getCallJitFormatErr(
        comp: JitErrorsCompiler,
        expected: BaseRunType<any>,
        formatter: BaseRunTypeFormat<any>,
        shouldReturn = false,
        extraPathLiteral?: StrNumber
    ) {
        return (paramName: string, paramValue: string | number | boolean | bigint) => {
            const callCode = comp.callJitFormatErr(expected, formatter, paramName, paramValue, extraPathLiteral);
            if (shouldReturn) return `return ${callCode}, ${comp.args.εrr}`;
            return callCode;
        };
    }

    printPath(rt: BaseRunType, paramName?: string): string {
        return [rt.getTypeName(), ...this.getFormatPath(paramName)].join('.');
    }
}
