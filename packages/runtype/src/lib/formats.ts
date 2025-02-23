/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {jitFnHasReturn, jitFnIsExpression} from '../constants';
import {ReflectionKindName} from '../constants.kind';
import type {JitFnID, MockOperation, ParsedAnnotation, PureFunction, TypeFormatParams, TypeFormatValue} from '../types';
import {
    metaAnnotation,
    ReflectionKind,
    TypeTupleMember,
    type TypeLiteral,
    type TypeObjectLiteral,
    type TypePropertySignature,
    type TypeTuple,
} from './_deepkit/src/reflection/type';
import type {BaseRunType} from './baseRunTypes';
import {JitCompiler, type JitErrorsCompiler} from './jitCompiler';
import {jitUtils} from './jitUtils';
import {toLiteral} from './utils';

export type TypeFormatter = JitRunTypeTransformer | JitRunTypeValidator;
const typeAnnotationsCache = new Map<string, TypeFormatter>();
const validatorPrefix = 'v';
const formatterPrefix = 'f';

/** Adds a TypeFormatter or TypeValidator to the formatters cache */
export function addFormatterToCache<T extends TypeFormatter>(operation: T, shouldThrow = false): T {
    const prefix = operation instanceof JitRunTypeValidator ? validatorPrefix : formatterPrefix;
    const id = getFormatterKey(prefix, operation.kind, operation.name);
    const exiting = typeAnnotationsCache.get(id);
    if (exiting && exiting !== operation) {
        if (shouldThrow)
            throw new Error(`Annotation type ${operation.name} already registered for ${ReflectionKindName[operation.kind]}`);
        return operation;
    }
    typeAnnotationsCache.set(id, operation);
    return operation;
}

/** Gets a TypeFormatter or TypeValidator to the formatters cache */
export function getFormattersFromCache(typeKind: ReflectionKind, name: string, shouldThrow = false): TypeFormatter[] {
    const validator = typeAnnotationsCache.get(getFormatterKey(validatorPrefix, typeKind, name));
    const formatter = typeAnnotationsCache.get(getFormatterKey(formatterPrefix, typeKind, name));
    if (!validator && !formatter) {
        if (shouldThrow) throw new Error(`Annotation type ${name} not found for ${ReflectionKindName[typeKind]}`);
        return [];
    }
    const result: TypeFormatter[] = [];
    if (validator) result.push(validator);
    if (formatter) result.push(formatter);
    return result;
}

export function getFormatterKey(prefix: string, kind: string | number, name: string | number): string {
    return `${prefix}:${kind}:${name}`;
}

export function getTypeFormats(rt: BaseRunType): TypeFormatter[] {
    const parsedAnnotations = metaAnnotation.getAnnotations(rt.src) as ParsedAnnotation[];
    return parsedAnnotations.map((a) => a.formatters).flat();
}

/** Returns the validator for a given type. ATM only one validator is allowed for each type */
export function getRunTypeValidator(rt: BaseRunType): JitRunTypeValidator | undefined {
    const parsedAnnotations = metaAnnotation.getAnnotations(rt.src) as ParsedAnnotation[];
    for (const annotation of parsedAnnotations) {
        const validator = annotation.formatters.find((f) => f instanceof JitRunTypeValidator);
        if (validator) return validator as JitRunTypeValidator;
    }
    return undefined;
}

export function getRunTypeTransformers(rt: BaseRunType): JitRunTypeTransformer[] {
    return getTypeFormats(rt).filter((f) => f instanceof JitRunTypeTransformer) as JitRunTypeTransformer[];
}

export function getParsedAnnotations(rt: BaseRunType): ParsedAnnotation[] {
    return metaAnnotation.getAnnotations(rt.src) as ParsedAnnotation[];
}

export function parseAnnotations(rt: BaseRunType): ParsedAnnotation[] {
    const dkAnnotations = metaAnnotation.getAnnotations(rt.src) as ParsedAnnotation[];
    if (dkAnnotations.length === 0) return dkAnnotations;
    // TODO: investigate why only a single annotation gets parsed, ie: type StringFormat<{maxLength:}> & Email, is just returning the Email annotation
    // We might actually want to enforce this, ie: we could have an email and uuid and those are not compatible
    if (dkAnnotations.length > 1) throw new Error(`Only one type annotation is allowed for ${rt.getTypeName()}`);
    for (const dkAnnotation of dkAnnotations) {
        if (dkAnnotation.options.length !== 1)
            // this should throw only if type formats are not properly defined by developers
            throw new Error(
                `Type Format only allow one options parameter for ${rt.getTypeName()}, use TypeFormat to create a new type format.`
            );
        const unparsedParams = dkAnnotation.options[0] as TypeObjectLiteral | TypeTuple | undefined;
        dkAnnotation.formatters = getFormattersFromCache(rt.src.kind, dkAnnotation.name);
        if (!unparsedParams) {
            dkAnnotation.params = {};
            dkAnnotation.jitId = '';
            continue;
        } else if (unparsedParams.kind === ReflectionKind.objectLiteral) {
            const jitIdResult = {jitId: ''};
            dkAnnotation.params = recursiveParseParams(rt, unparsedParams, jitIdResult) as TypeFormatParams;
            dkAnnotation.jitId = jitIdResult.jitId;
        } else {
            throw new Error(`Unsupported type params for ${rt.getTypeName()}, type params must be an object literal`);
        }
    }
    return dkAnnotations;
}

function recursiveParseParams(
    rt: BaseRunType,
    propValue: TypeObjectLiteral | TypeTuple,
    idResult: {jitId: string}
): TypeFormatValue {
    const properties = propValue.types as TypePropertySignature[] | TypeTupleMember[];
    const paramsResult = propValue.kind === ReflectionKind.objectLiteral ? {} : [];
    let index = 0;
    for (const prop of properties) {
        const propIndex = prop.name ? String(prop.name) : index;
        const name = prop.name ? String(prop.name) : prop.kind;
        const memberItem = prop.type;
        idResult.jitId += `${name}:`;
        switch (memberItem.kind) {
            case ReflectionKind.objectLiteral:
                idResult.jitId += '{';
                paramsResult[propIndex] = recursiveParseParams(rt, memberItem as TypeObjectLiteral, idResult);
                idResult.jitId += '}';
                break;
            case ReflectionKind.tuple:
                idResult.jitId += '[';
                paramsResult[propIndex] = recursiveParseParams(rt, memberItem as TypeTuple, idResult);
                idResult.jitId += ']';
                break;
            case ReflectionKind.literal:
                paramsResult[propIndex] = (memberItem as TypeLiteral).literal;
                idResult.jitId += String(paramsResult[propIndex]);
                break;
            default:
                throw new Error(`Unsupported type format value for ${name} in ${rt.getTypeName()}`);
        }
        index++;
    }
    return paramsResult;
}

// TODO: ensure params are returned in the same order as they are defined in the type format
export function getFormatterParams<P extends TypeFormatParams>(
    rt: BaseRunType,
    name: string,
    type: 'validator' | 'formatter',
    defaultParams: P
): P {
    const isValidator = type === 'validator';
    const annotations = rt.getTypeAnnotations().filter((a) => a.name === name);
    for (const annotation of annotations) {
        const formatter = annotation.formatters.find((f) => {
            const targetIsValidator = f instanceof JitRunTypeValidator;
            return isValidator ? targetIsValidator : !targetIsValidator;
        });
        if (!formatter) continue;
        return recursiveSetDefaultValues(rt, defaultParams, annotation.params);
    }
    throw new Error(`Type Formatter ${name} not found for ${rt.getTypeName()}`);
}

/** Returns the default value for a given type. */
export function recursiveSetDefaultValues<D extends TypeFormatParams>(rt: BaseRunType, defaults: D, params: TypeFormatParams): D {
    if (Object.keys(params).length === 0) return JSON.parse(JSON.stringify(defaults));
    const paramsCopy = {...params};
    for (const key in defaults) {
        const defaultVal = defaults[key];
        if (typeof defaultVal === 'undefined') continue;
        if (paramsCopy[key] === undefined) paramsCopy[key] = defaultVal;
        const copyVal = paramsCopy[key];
        const isDefaultRecord = isRecord(defaultVal);
        const isParamsRecord = isRecord(copyVal);
        if (isDefaultRecord && isParamsRecord) {
            paramsCopy[key] = recursiveSetDefaultValues(rt, defaultVal, copyVal);
        } else if (isDefaultRecord !== isParamsRecord) {
            throw new Error(`Default value and Type param value for ${key} in ${rt.getTypeName()} must have the same type.`);
        }
    }
    return paramsCopy as D;
}

function isRecord(value: TypeFormatValue): value is TypeFormatParams {
    return typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof RegExp);
}

/**
 * Adds an existing pure function to the context and return code calling it.
 * The function must have a name, be pure, have no side effects and no dependencies, otherwise compiled code will not work.
 * The pure function is transformed into code simply by calling toString() on it.
 * All parameters must be passed as a single params object.
 */
export function compilePureFunctionCall(
    comp: JitCompiler,
    rt: BaseRunType,
    pureFn: PureFunction<any>,
    params?: TypeFormatParams
): string {
    const name = pureFn.name;
    if (!name) throw new Error('Pure function must have a name');
    jitUtils.addPureFn(pureFn);
    comp.addPureFnDependency(pureFn);

    // Add context code for the pure function and params
    const varName = `${name}${rt.getNestLevel()}_${comp.contextCodeItems.size}`;
    const paramsName = `${varName}P`;
    const pureFunctionCode = `const ${varName} = utl.getPureFn(${toLiteral(name)})`;
    const paramsCode = params ? `const ${paramsName} = ${JSON.stringify(params)}` : '{}';
    comp.contextCodeItems.set(varName, pureFunctionCode);
    comp.contextCodeItems.set(paramsName, paramsCode);

    // call the pure function, passing value, jitUtils and params (pure function arguments)
    return `${varName}(${comp.vλl},utl,${paramsName})`;
}

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

/** Base class for all type formatters. */
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
