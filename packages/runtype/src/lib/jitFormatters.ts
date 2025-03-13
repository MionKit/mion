/* eslint-disable @typescript-eslint/no-unused-vars */
/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from './baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from './jitCompiler';
import type {TypeFormatParams, JitFnID, MockOperation} from '../types';
import {jitFnHasReturn, jitFnIsExpression, JitFunctions} from '../constants';
import {ReflectionKind} from '@deepkit/type';
import {getFormatterParams} from './formats';

type jitCode = string | undefined;

export abstract class JitRunTypeFormatter<P extends TypeFormatParams = any> {
    abstract kind: ReflectionKind;
    abstract name: string;
    jitFnHasReturn(fnId: JitFnID) {
        return jitFnHasReturn(fnId);
    }
    jitFnIsExpression(fnId: JitFnID) {
        return jitFnIsExpression(fnId);
    }

    params?: P;
    path?: string[];

    private pushContext(params?: P, path?: string[]) {
        this.params = params;
        this.path = path;
    }

    private popContext() {
        this.params = undefined;
        this.path = undefined;
    }

    getParams(rt: BaseRunType): NonNullable<P> {
        if (this.params) return this.params as NonNullable<P>;
        const params = getFormatterParams(rt, this.name) as NonNullable<P>;
        this.validateParams?.(rt, params);
        return params;
    }

    mock(mockContext: MockOperation, rt: BaseRunType, params?: P, path?: string[]): any {
        this.pushContext(params, path);
        const result = this._mock(mockContext, rt);
        this.popContext();
        return result;
    }

    compileIsType(comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode {
        return this.compile(JitFunctions.isType.id, comp, rt, params, path, vλl);
    }
    compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode {
        return this.compile(JitFunctions.typeErrors.id, comp, rt, params, path, vλl);
    }
    compileFromJsonVal = (comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode => {
        return this.compile(JitFunctions.fromJsonVal.id, comp, rt, params, path, vλl);
    };
    compileToJsonVal = (comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode => {
        return this.compile(JitFunctions.toJsonVal.id, comp, rt, params, path, vλl);
    };
    compileJsonStringify = (comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode => {
        return this.compile(JitFunctions.jsonStringify.id, comp, rt, params, path, vλl);
    };
    compileFormat?(comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string): jitCode {
        return this.compile(JitFunctions.format.id, comp, rt, params, path, vλl);
    }

    compile(fn: JitFnID, comp: JitCompiler, rt: BaseRunType, params?: P, path?: string[], vλl?: string) {
        const v = comp.vλl;
        comp.vλl = vλl || v;
        this.pushContext(params, path);
        let result: jitCode;
        switch (fn) {
            case JitFunctions.isType.id:
                result = this._compileIsType(comp, rt);
                break;
            case JitFunctions.typeErrors.id:
                result = this._compileTypeErrors(comp as JitErrorsCompiler, rt);
                break;
            case JitFunctions.fromJsonVal.id:
                result = this._compileFromJsonVal(comp, rt);
                break;
            case JitFunctions.toJsonVal.id:
                result = this._compileToJsonVal(comp, rt);
                break;
            case JitFunctions.jsonStringify.id:
                result = this._compileJsonStringify(comp, rt);
                break;
            case JitFunctions.format.id:
                result = this._compileFormat ? this._compileFormat(comp, rt) : undefined;
                break;
            default:
                throw new Error(`Method not implemented: ${fn}`);
        }
        this.popContext();
        comp.vλl = v;
        return result;
    }

    abstract _mock(mockContext: MockOperation, rt: BaseRunType): any;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): jitCode;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): jitCode;
    abstract _compileFormat?(comp: JitCompiler, rt: BaseRunType): jitCode;

    _compileFromJsonVal = (comp: JitCompiler, rt: BaseRunType): jitCode => undefined;
    _compileToJsonVal = (comp: JitCompiler, rt: BaseRunType): jitCode => undefined;
    _compileJsonStringify = (comp: JitCompiler, rt: BaseRunType): jitCode => undefined;

    // ###### optional methods for type formatters ########

    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;
}
