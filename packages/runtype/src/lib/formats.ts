/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKindName} from '../constants.kind';
import type {CompiledPureFunction, ParsedAnnotation, PureFunctionWithContext, TypeFormatParams, TypeFormatValue} from '../types';
import {
    metaAnnotation,
    ReflectionKind,
    type TypeTupleMember,
    type TypeLiteral,
    type TypeObjectLiteral,
    type TypePropertySignature,
    type TypeTuple,
} from './_deepkit/src/reflection/type';
import type {BaseRunType} from './baseRunTypes';
import {JitErrorsCompiler, type JitCompiler} from './jitCompiler';
import {FormatterType, JitRunTypeFormatter, JitRunTypeTransformer, JitRunTypeValidator} from './jitFormatters';
import {jitUtils} from './jitUtils';
import {isSafePropName, toLiteral} from './utils';

export type TypeFormatter = JitRunTypeFormatter | JitRunTypeValidator;
const typeAnnotationsCache = new Map<string, TypeFormatter>();
const validatorPrefix = 'v';
const formatterPrefix = 'f';

/** Adds a TypeFormatter or TypeValidator to the formatters cache */
export function registerFormatter<T extends TypeFormatter>(operation: T, shouldThrow = false): T {
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

export function registerPureFunctionWithCtx(fnWithCtx: PureFunctionWithContext<any>): CompiledPureFunction {
    const existing = jitUtils.getCompiledPureFn(fnWithCtx.name);
    if (existing && existing.originFnWithCtx && existing.originFnWithCtx !== fnWithCtx)
        throw new Error(`Pure function with name ${fnWithCtx.name} already exists`);
    if (existing) return existing;
    const compiled = parsePureFunctionWithCtx(fnWithCtx);
    jitUtils.addPureFn(compiled);
    return compiled;
}

export function registerPureFunctionGroupWithCtx(fnsWithCtx: PureFunctionWithContext<any>[]): CompiledPureFunction[] {
    const compiledFns = fnsWithCtx.map((fn) => registerPureFunctionWithCtx(fn));
    compiledFns.forEach((cfn) => {
        compiledFns.forEach((cf) => {
            if (cfn.name === cf.name) return;
            cf.dependencies.add(cfn.name);
        });
    });
    return compiledFns;
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
export function getRunTypeValidator(rt: BaseRunType): JitRunTypeValidator | JitRunTypeFormatter | undefined {
    const parsedAnnotations = metaAnnotation.getAnnotations(rt.src) as ParsedAnnotation[];
    for (const annotation of parsedAnnotations) {
        const validator = annotation.formatters.find((f) => f.type === 'F' || f.type === 'V');
        if (validator) return validator as JitRunTypeValidator | JitRunTypeFormatter;
    }
    return undefined;
}

export function getRunTypeTransformers(rt: BaseRunType): (JitRunTypeFormatter | JitRunTypeTransformer)[] {
    return getTypeFormats(rt).filter((f) => f.type === 'T' || f.type === 'F') as JitRunTypeFormatter[];
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
    type: FormatterType,
    defaultParams: P
): P {
    const isValidator = type === 'V';
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

export function typeParamsToLiteral(params: TypeFormatValue): string {
    switch (true) {
        case typeof params === 'string':
            return toLiteral(params);
        case typeof params === 'number':
            return `${params}`;
        case typeof params === 'boolean':
            return params ? 'true' : 'false';
        case params instanceof RegExp:
            return params.toString();
        case Array.isArray(params):
            return `[${params.map((v) => typeParamsToLiteral(v)).join(', ')}]`;
        case typeof params === 'object': {
            const entriesLiterals = Object.entries(params).map(([k, v]) => {
                const propName = isSafePropName(k) ? k : toLiteral(k);
                return `${propName}: ${typeParamsToLiteral(v)}`;
            });
            return `{${entriesLiterals.join(', ')}}`;
        }
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
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
    pureFn: PureFunctionWithContext<any>,
    params: TypeFormatParams
): string {
    const {varName, paramsName} = compilePureFunctionContext(comp, rt, pureFn, params);
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    return `${varName}(${comp.vλl},${paramsName})`;
}

export function compileErrorsPureFunctionCall(
    comp: JitErrorsCompiler,
    rt: BaseRunType,
    pureFn: PureFunctionWithContext<any>,
    params: TypeFormatParams,
    format: string
): string {
    const {varName, paramsName} = compilePureFunctionContext(comp, rt, pureFn, params);
    const errVarName = `${varName}Err`;
    const pathItems = comp.getStackStaticPathArgs();
    const expectLiteral = toLiteral(rt.getKindName());

    // call the pure function, passing value, jitUtils and params (pure function arguments)
    const errorPureFnCall = `const ${errVarName} = ${varName}(${comp.vλl},${paramsName},${comp.args.εrr})`;
    const infoCode = `{name:${toLiteral(format)},invalid:${errVarName}}`;
    const typeName = rt.src.typeName ? toLiteral(rt.src.typeName) : 'undefined';
    const callJitErr = `if (${errVarName}) utl.err(${comp.args.εrr},${comp.args.pλth},[${pathItems}],${expectLiteral},${typeName},${infoCode});`;
    return `${errorPureFnCall};${callJitErr}`;
}

export function compilePureFunctionContext(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    pureFn: PureFunctionWithContext<any>,
    params: TypeFormatParams
): {varName: string; paramsName: string} {
    const name = pureFn.name;
    if (!name) throw new Error('Pure function must have a name');
    registerPureFunctionWithCtx(pureFn); // will throw if there is a different pure function with the same name
    comp.addPureFnDependency(pureFn);
    // Add context code for the pure function and params
    const varName = `${name}${rt.getNestLevel()}`;
    const pureFunctionCode = `const ${varName} = utl.getPureFn(${toLiteral(name)})`;
    comp.contextCodeItems.set(varName, pureFunctionCode);
    const {paramsName} = compileAddParamsToCtx(comp, rt, params);
    return {varName, paramsName};
}

export function compileAddParamsToCtx(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    params: TypeFormatParams
): {paramsName: string} {
    const paramsName = `ftPrams${rt.getNestLevel()}`; //TODO: we might need to add a name based on the type formatter
    if (comp.contextCodeItems.has(paramsName)) return {paramsName};
    const paramsCode = `const ${paramsName} = ${typeParamsToLiteral(params)}`;
    comp.contextCodeItems.set(paramsName, paramsCode);
    return {paramsName};
}

function parsePureFunctionWithCtx(fnWithContext: PureFunctionWithContext<any>): CompiledPureFunction {
    if (!fnWithContext.name) throw new Error('Pure Functions must have a name');

    const fnString = fnWithContext.toString();
    const bodyStart = fnString.indexOf('{');
    const bodyEnd = fnString.lastIndexOf('}');
    if (bodyStart === -1 || bodyEnd === -1 || bodyEnd <= bodyStart) throw new Error("Invalid function, can't parse body");

    const paramsStart = fnString.indexOf('(') + 1;
    const paramsEnd = fnString.indexOf(')');

    if (paramsStart === 0 || paramsEnd === -1 || paramsEnd < paramsStart) {
        throw new Error("Invalid function, can't parse parameters");
    }

    const paramsString = fnString.substring(paramsStart, paramsEnd).trim();
    const paramNames = paramsString.length > 0 ? paramsString.split(/\s*,\s*/) : [];
    if (paramNames.length > 1) throw new Error('Pure function with context must have max 1 parameter');

    // Validate parameters
    const validIdentifier = /^[_$a-zA-Z][_$a-zA-Z0-9]*$/;
    for (const param of paramNames) {
        if (!validIdentifier.test(param))
            throw new Error(
                `Invalid parameter name: ${param}, pure function parameters must be valid identifiers and do not allow default values.`
            );
    }

    const body = fnString.substring(bodyStart + 1, bodyEnd);
    const compiled = {
        originFnWithCtx: fnWithContext,
        fn: null as any, // will be set later so all possible dependencies are resolved
        name: fnWithContext.name,
        paramNames,
        body,
        dependencies: new Set<string>(),
    };
    return compiled;
}
