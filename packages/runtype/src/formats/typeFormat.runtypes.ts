/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */
// ###################### Types FORMATS #####################

import {jitFnHasReturn, jitFnIsExpression} from '../constants';
import {TypeLiteral, type ReflectionKind} from '../lib/_deepkit/src/reflection/type';
import type {BaseRunType} from '../lib/baseRunTypes';
import type {JitCompiler, JitErrorsCompiler} from '../lib/jitCompiler';
import {JitFnID} from '../types';

export type ValidatorParams = {
    /**
     * Validator name, or {name + params}.
     * Must match the name of an existing JitRunTypeValidator
     */
    validator?: string | {validator: string; [key: string]: TypeLiteral['literal']};
};

export type FormatterParams = {
    /**
     * Formatter name, or {name + params}.
     * Must match the name of an existing JitRunTypeFormatter
     */
    formatter?: string | {formatter: string; [key: string]: TypeLiteral['literal']};
};

/**
 * Type Validator and Formatter parameters
 */
export type TypeParams = ValidatorParams & FormatterParams;

/**
 * A base type that satisfies some extra constrains. (at the moment only Branded types of strings and numbers are supported)
 * ie: an Alphanumeric type is an string that only allow letters and numbers.
 * ie: in Integer type is a number that only allow integer values.
 *
 * TypeFormat is the equivalent ot TypeAnnotation in DK but with slight modifications ./lib/_deepkit/src/reflection/type<TypeAnnotation>
 * */

export type TypeFormat<BaseType extends string | number, Name extends string, P extends TypeParams> = BaseType & {
    __meta?: never & [Name, P];
};

export abstract class JitRunTypeValidator {
    abstract kind: ReflectionKind;
    abstract name: string;
    abstract _compileIsType(comp: JitCompiler, rt: BaseRunType): string;
    abstract _compileTypeErrors(comp: JitErrorsCompiler, rt: BaseRunType): string;

    jitFnHasReturn = (fnId: JitFnID) => jitFnHasReturn(fnId);
    jitFnIsExpression = (fnId: JitFnID) => jitFnIsExpression(fnId);
}
export abstract class JitRunTypeFormatter {
    abstract kind: ReflectionKind;
    abstract name: string;
    abstract _compileFromJsonVal(comp: JitCompiler, rt: BaseRunType): string | undefined;
    abstract _compileToJsonVal(comp: JitCompiler, rt: BaseRunType): string | undefined;
    abstract _compileJsonStringify(comp: JitCompiler, rt: BaseRunType): string;

    jitFnHasReturn = (fnId: JitFnID) => jitFnHasReturn(fnId);
    jitFnIsExpression = (fnId: JitFnID) => jitFnIsExpression(fnId);
}
