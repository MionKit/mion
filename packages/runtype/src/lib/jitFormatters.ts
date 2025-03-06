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
import {ReflectionKind} from '@deepkit/type';
import {getFormatterParams, typeParamsToLiteral} from './formats';

export type FormatterType = 'F' | 'V' | 'T'; // formatter | validator | transformer

export abstract class BaseFormatter<P extends TypeFormatParams = TypeFormatParams> {
    abstract kind: ReflectionKind;
    abstract name: string;
    abstract type: FormatterType;

    getParams(rt: BaseRunType, defaultParams: NonNullable<P>): NonNullable<P> {
        const params = getFormatterParams(rt, this.name, this.type, defaultParams) as NonNullable<P>;
        this.validateParams?.(rt, params);
        return params;
    }

    /** Throws an error if params are not valid */
    validateParams?(rt: BaseRunType, params: P): void;
    jitFnHasReturn = (fnId: JitFnID) => jitFnHasReturn(fnId);
    jitFnIsExpression = (fnId: JitFnID) => jitFnIsExpression(fnId);
    getCtxVarName(comp: JitCompiler, rt: BaseRunType, name: string): string {
        return `${name}${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
    }
    addParamsToContext(comp: JitCompiler, rt: BaseRunType, name: string): string {
        const params = this.getParams(rt, {} as NonNullable<P>);
        const ctxName = this.getCtxVarName(comp, rt, name) + 'P';
        const ctxCode = `const ${ctxName} = ${typeParamsToLiteral(params)};`;
        comp.contextCodeItems.set(ctxName, ctxCode);
        return ctxName;
    }
}

/** Base class for all type validators. */
export abstract class JitRunTypeValidator<P extends TypeFormatParams = TypeFormatParams> extends BaseFormatter<P> {
    type: FormatterType = 'V';
    abstract _mock(mockContext: MockOperation, rt: BaseRunType): any;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string;
}

/** Base class for all type Transformers. */
export abstract class JitRunTypeTransformer<P extends TypeFormatParams = TypeFormatParams> extends BaseFormatter<P> {
    type: FormatterType = 'T';
    abstract _format(comp: JitCompiler, rt: BaseRunType): string;
    abstract _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string;

    /** Value are always transformed on ingest by default, Formatters can override this method to change functionality. */
    _compileFromJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => this._format(comp, rt);
    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileToJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined;
    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileJsonStringify = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined;
}

/** Base class for all type formatters, these area a mix of validators and transformers. */
export abstract class JitRunTypeFormatter<P extends TypeFormatParams = TypeFormatParams> extends BaseFormatter<P> {
    type: FormatterType = 'F';

    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string;

    abstract _format(comp: JitCompiler, rt: BaseRunType): string;
    abstract _mock(mockContext: MockOperation, rt: BaseRunType): any;
    abstract _formatMockedValue(mockContext: MockOperation, rt: BaseRunType, val: any): string;

    /** Value are always transformed on ingest by default, Formatters can override this method to change functionality. */
    _compileFromJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => this._format(comp, rt);
    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileToJsonVal = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined;
    /** Value are NOT transformed on egress by default, Formatters can override this method to change functionality. */
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    _compileJsonStringify = (comp: JitCompiler, rt: BaseRunType): string | undefined => undefined;
}
