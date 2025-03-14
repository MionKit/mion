/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionKindName} from '../constants.kind';
import type {
    CompiledPureFunction,
    FormatAnnotation,
    PureFunction,
    PureFunctionWithContext,
    TypeFormatParams,
    TypeFormatValue,
} from '../types';
import {typeAnnotation, ReflectionKind} from '@deepkit/type';
import type {BaseRunType} from './baseRunTypes';
import {JitErrorsCompiler, type JitCompiler} from './jitCompiler';
import {JitRunTypeFormatter} from './jitFormatters';
import {jitUtils} from './jitUtils';
import {isSafePropName, toLiteral} from './utils';

// ################# REGISTER FORMATTERS & PURE FUNCTIONS  #################

const typeAnnotationsCache = new Map<string, JitRunTypeFormatter>();
const formatterPrefix = 'f';

/** Adds a TypeFormatter or TypeValidator to the formatters cache */
export function registerFormatter<T extends JitRunTypeFormatter>(operation: T, shouldThrow = false): T {
    const id = getFormatterKey(formatterPrefix, operation.kind, operation.name);
    const exiting = typeAnnotationsCache.get(id);
    if (exiting && exiting !== operation) {
        if (shouldThrow)
            throw new Error(`Annotation type ${operation.name} already registered for ${ReflectionKindName[operation.kind]}`);
        return operation;
    }
    typeAnnotationsCache.set(id, operation);
    return operation;
}

export function registerPureFunctionWithCtx(
    fnWithCtx: PureFunctionWithContext<any>,
    dependencies?: PureFunctionWithContext<any>[]
): CompiledPureFunction {
    const existing = jitUtils.getCompiledPureFn(fnWithCtx.name);
    if (existing && existing.originFnWithCtx && existing.originFnWithCtx !== fnWithCtx)
        throw new Error(`Pure function with name ${fnWithCtx.name} already exists`);
    if (existing) return existing;
    const compiled = parsePureFunctionWithCtx(fnWithCtx);
    if (dependencies) {
        dependencies.forEach((d) => registerPureFunctionWithCtx(d));
        dependencies.forEach((d) => compiled.dependencies.add(d.name));
    }
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

export function getPureFn(fnOrName: string | PureFunctionWithContext<any>): PureFunction<TypeFormatParams> | undefined {
    if (typeof fnOrName === 'string') return jitUtils.getPureFn(fnOrName);
    const name = fnOrName.name;
    if (!name) throw new Error('Pure Functions must have a name');
    return jitUtils.getPureFn(name);
}

export function getCompiledPureFn(fnOrName: string | PureFunctionWithContext<any>): CompiledPureFunction | undefined {
    if (typeof fnOrName === 'string') return jitUtils.getCompiledPureFn(fnOrName);
    const name = fnOrName.name;
    if (!name) throw new Error('Pure Functions must have a name');
    return jitUtils.getCompiledPureFn(name);
}

/** Gets a TypeFormatter or TypeValidator to the formatters cache */
export function getFormatterFromCache(
    typeKind: ReflectionKind,
    name: string,
    shouldThrow = false
): JitRunTypeFormatter | undefined {
    const formatter = typeAnnotationsCache.get(getFormatterKey(formatterPrefix, typeKind, name));
    if (!formatter) {
        if (shouldThrow) throw new Error(`Annotation type ${name} not found for ${ReflectionKindName[typeKind]}`);
        return undefined;
    }
    return formatter;
}

export function getFormatterKey(prefix: string, kind: string | number, name: string | number): string {
    return `${prefix}:${kind}:${name}`;
}

export function getTypeFormats(rt: BaseRunType): JitRunTypeFormatter[] {
    const parsedAnnotations = typeAnnotation.getAnnotations(rt.src) as any as FormatAnnotation[];
    return parsedAnnotations.map((a) => a.formatter).flat();
}

/** Returns the validator for a given type. ATM only one validator is allowed for each type */
export function getRunTypeFormatter(rt: BaseRunType): JitRunTypeFormatter | undefined {
    const parsedAnnotations = typeAnnotation.getAnnotations(rt.src) as any as FormatAnnotation[];
    for (const annotation of parsedAnnotations) {
        return annotation.formatter;
    }
    return undefined;
}

export function getRunTypeTransformers(rt: BaseRunType): JitRunTypeFormatter[] {
    return getTypeFormats(rt).filter((f) => !!f._compileFormat) as JitRunTypeFormatter[];
}

export function getFormatAnnotations(rt: BaseRunType): FormatAnnotation[] {
    return typeAnnotation.getAnnotations(rt.src) as any as FormatAnnotation[];
}

// ################# ANNOTATIONS  #################

/**
 * Reads deepkit annotations and augment them with the associated formatters.
 * @param rt
 * @returns
 */
export function initFormatAnnotations(rt: BaseRunType): FormatAnnotation[] {
    const annotations = typeAnnotation.getAnnotations(rt.src);
    if (annotations.length === 0) return annotations as FormatAnnotation[];
    if (annotations.length > 1) throw new Error(`Only one type annotation is allowed for ${rt.getTypeName()}`);
    for (const annotation of annotations) {
        if (!annotation.name) throw new Error(`Type annotation must have a name for ${rt.getTypeName()}`);

        const params = annotation.options;
        const formatter = getFormatterFromCache(rt.src.kind, annotation.name);
        if (params.kind !== ReflectionKind.objectLiteral)
            throw new Error(`Type annotation must be an object literal for ${rt.getTypeName()}`);
        if (!formatter) throw new Error(`Type Formatter ${annotation.name} not found for ${rt.getTypeName()}`);
        (annotation as FormatAnnotation).formatter = formatter;
    }
    return annotations as FormatAnnotation[];
}

export function getAnnotationParams(annotation: FormatAnnotation, rt: BaseRunType): TypeFormatParams {
    if (annotation.params) return annotation.params;
    annotation.params = typeAnnotation.getOption(rt.src, annotation.name) as TypeFormatParams;
    return annotation.params;
}

/** Returns the params for a given type formatter */
export function getFormatterParams<P extends TypeFormatParams>(rt: BaseRunType, name: string): P {
    const annotations = rt.getFormatAnnotations().filter((a) => a.name === name);
    for (const annotation of annotations) {
        const formatter = annotation.formatter;
        if (!formatter) continue;
        return getAnnotationParams(annotation, rt) as P;
    }
    throw new Error(`Type Formatter ${name} not found for ${rt.getTypeName()}`);
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

// ################# COMPILING  #################

/**
 * Adds an existing pure function to the context and return code calling it.
 * The function must have a name, be pure, have no side effects and no dependencies, otherwise compiled code will not work.
 * The pure function is transformed into code simply by calling toString() on it.
 * All parameters must be passed as a single params object.
 */
export function compilePureFunctionCall(
    comp: JitCompiler,
    rt: BaseRunType,
    ft: JitRunTypeFormatter,
    pureFn: PureFunctionWithContext<any>,
    overrideParams?: TypeFormatValue
): {callCode: string; fnName: string; paramsName: string} {
    const {fnName, paramsName} = compilePureFunctionContext(comp, rt, ft, pureFn, overrideParams);
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    return {callCode: `${fnName}(${comp.vλl},${paramsName})`, fnName, paramsName};
}

export function compileErrorsPureFunctionCall(
    comp: JitErrorsCompiler,
    rt: BaseRunType,
    ft: JitRunTypeFormatter,
    pureFn: PureFunctionWithContext<any>,
    overrideParams?: TypeFormatValue
): {callCode: string; fnName: string; paramsName: string} {
    const {fnName, paramsName} = compilePureFunctionContext(comp, rt, ft, pureFn, overrideParams);
    const errVarName = `${fnName}Err`;
    const pathItems = comp.getStackStaticPathArgs();
    const expectLiteral = toLiteral(rt.getKindName());

    // call the pure function, passing value, jitUtils and params (pure function arguments)
    const errorPureFnCall = `const ${errVarName} = ${fnName}(${comp.vλl},${paramsName},${comp.args.εrr})`;
    const infoCode = `{name:${toLiteral(ft.name)},invalid:${errVarName}}`;
    const callJitErr = `if (${errVarName}) utl.err(${comp.args.εrr},${comp.args.pλth},[${pathItems}],${expectLiteral},${infoCode});`;
    return {callCode: `${errorPureFnCall};${callJitErr}`, fnName, paramsName};
}

export function compilePureFunctionContext(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    ft: JitRunTypeFormatter,
    pureFn: PureFunctionWithContext<any>,
    overrideParams?: TypeFormatValue
): {fnName: string; paramsName: string} {
    const name = pureFn.name;
    if (!name) throw new Error('Pure function must have a name');
    registerPureFunctionWithCtx(pureFn); // will throw if there is a different pure function with the same name
    comp.addPureFnDependency(pureFn);
    // Add context code for the pure function and params
    const fnName = getPureFnName(name, rt.getNestLevel());
    const pureFunctionCode = `const ${fnName} = utl.getPureFn(${toLiteral(name)})`;
    comp.contextCodeItems.set(fnName, pureFunctionCode);
    const {paramsName} = compileAddParamsToCtx(comp, rt, ft, overrideParams);
    return {fnName, paramsName};
}

function getPureFnName(name: string, nestLevel: number): string {
    return `${name}${nestLevel}`;
}

export function compileAddParamsToCtx(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    ft: JitRunTypeFormatter,
    overrideParams?: TypeFormatValue
): {paramsName: string} {
    if (ft.parentPath?.length) return {paramsName: ft.parentPath.map((p) => toLiteral(p)).join('.')};
    const params = overrideParams || ft.getParams(rt);
    const paramsName = `args${rt.getNestLevel()}`; //TODO: we might need to add a name based on the type formatter
    if (comp.contextCodeItems.has(paramsName)) return {paramsName};
    const paramsCode = `const ${paramsName} = ${typeParamsToLiteral(comp, params, ft.ignoreJitParams)}`;
    comp.contextCodeItems.set(paramsName, paramsCode);
    return {paramsName};
}

function typeParamsToLiteral(comp: JitCompiler | JitErrorsCompiler, params: TypeFormatValue, ignoreProps?: string[]): string {
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
            return `[${params.map((v) => typeParamsToLiteral(comp, v)).join(', ')}]`;
        case typeof params === 'object': {
            const entriesLiterals = Object.entries(params)
                .filter((ent) => ent[1] !== undefined && (!ignoreProps || !ignoreProps.includes(ent[0])))
                .map(([k, v]) => {
                    if (isPureFunctionCallLiteral(k)) {
                        if (typeof v !== 'string')
                            throw new Error(
                                `Params pure functions must have the function's name as value, ie {'isUUIDFn()': 'isUUID'}`
                            );
                        return compileParamPureFunctionCall(comp, k, v);
                    }
                    const propName = isSafePropName(k) ? k : toLiteral(k);
                    return `${propName}: ${typeParamsToLiteral(comp, v)}`;
                });
            return `{${entriesLiterals.join(', ')}}`;
        }
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
}

/**
 * Some params might be calls to load a jit utils pure function instead of literal values.
 * This is so pure function can be passed as params to other pure functions.
 * To define a param that is a pure function load, the propName must end with '()', and the value is the name of the pure function.
 * ie: params = {'isUUIDFn()': 'isUUID'} will be compiled as {isUUIDFn: utl.getPureFn('isUUID')}
 * So later it can be called as params.isUUIDFn(value, params)
 * The property value is the name of the pure function.
 * A bit hacky but it works 😜
 * @param propName
 * @returns
 */
function compileParamPureFunctionCall(comp: JitCompiler | JitErrorsCompiler, propName: string, fnName: string): string {
    comp.addPureFnDependency(fnName);
    return `${trimPureFnNameAsParam(propName)}: utl.getPureFn(${toLiteral(fnName)})`;
}

function isPureFunctionCallLiteral(propName: string): boolean {
    return propName.endsWith('()');
}

function trimPureFnNameAsParam(propName: string): string {
    return propName.replace('()', '');
}
