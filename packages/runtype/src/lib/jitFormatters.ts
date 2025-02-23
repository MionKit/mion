/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
import type {BaseRunType} from './baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from './jitCompiler';
import type {TypeFormatParams, JitFnID, MockOperation} from '../types';
import {jitFnHasReturn, jitFnIsExpression} from '../constants';
import {ReflectionKind} from './_deepkit/src/reflection/type';
import {getFormatterParams} from './formats';

/** Base class for all type validators. */
export abstract class JitRunTypeValidator<P extends TypeFormatParams = TypeFormatParams> {
    abstract kind: ReflectionKind;
    abstract name: string;

    getParams(rt: BaseRunType, defaultParams: NonNullable<P>) {
        const params = getFormatterParams(rt, this.name, 'validator', defaultParams) as NonNullable<P>;
        this.validateParams?.(rt, params);
        return params;
    }
    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;
    jitFnHasReturn = (fnId: JitFnID) => jitFnHasReturn(fnId);
    jitFnIsExpression = (fnId: JitFnID) => jitFnIsExpression(fnId);

    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string;
    abstract _mock(mockContext: MockOperation, rt: BaseRunType): any;
}

/** Base class for all type formatters/ transformers. */
export abstract class JitRunTypeTransformer<P extends TypeFormatParams = TypeFormatParams> {
    abstract kind: ReflectionKind;
    abstract name: string;

    getParams(rt: BaseRunType, defaultParams: NonNullable<P>) {
        const params = getFormatterParams(rt, this.name, 'formatter', defaultParams) as NonNullable<P>;
        this.validateParams?.(rt, params);
        return params;
    }

    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;
    jitFnHasReturn = (fnId: JitFnID) => jitFnHasReturn(fnId);
    jitFnIsExpression = (fnId: JitFnID) => jitFnIsExpression(fnId);
    abstract _mock(mockContext: MockOperation, rt: BaseRunType, val: any): any;
    abstract _format(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string;

    /** Value are always transformed on ingest by default, Formatters can override this method to change functionality. */
    _compileFromJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => this._format(comp, rt);

    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    _compileToJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined; // eslint-disable-line @typescript-eslint/no-unused-vars

    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    _compileJsonStringify = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined; // eslint-disable-line @typescript-eslint/no-unused-vars
}
