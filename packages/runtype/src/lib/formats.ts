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

export function typeParamsToLiteral(params: TypeFormatValue, ignoreProps?: string[]): string {
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
            const entriesLiterals = Object.entries(params)
                .filter((ent) => ent[1] !== undefined && (!ignoreProps || !ignoreProps.includes(ent[0])))
                .map(([k, v]) => {
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
    params: TypeFormatParams | string[],
    ignoreProps?: string[]
): string {
    const {fnName, paramsName} = compilePureFunctionContext(comp, rt, pureFn, params, ignoreProps);
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    return `${fnName}(${comp.vλl},${paramsName})`;
}

export function compileMultiplePureFunctionCall(
    comp: JitCompiler,
    rt: BaseRunType,
    params: TypeFormatParams | string[],
    pureFnList: {fn: PureFunctionWithContext<any>; paramsPath: string; vλl: string}[],
    ignoreProps?: string[]
): string[] {
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    return pureFnList.map((fnArgs) => {
        const {fn, paramsPath, vλl} = fnArgs;
        const {fnName, paramsName} = compilePureFunctionContext(comp, rt, fn, params, ignoreProps);
        return `${fnName}(${vλl},${paramsName}.${paramsPath})`;
    });
}

export function compileErrorsPureFunctionCall(
    comp: JitErrorsCompiler,
    rt: BaseRunType,
    pureFn: PureFunctionWithContext<any>,
    params: TypeFormatParams | string[],
    formatName: string,
    ignoreProps?: string[]
): string {
    const {fnName: varName, paramsName} = compilePureFunctionContext(comp, rt, pureFn, params, ignoreProps);
    const errVarName = `${varName}Err`;
    const pathItems = comp.getStackStaticPathArgs();
    const expectLiteral = toLiteral(rt.getKindName());

    // call the pure function, passing value, jitUtils and params (pure function arguments)
    const errorPureFnCall = `const ${errVarName} = ${varName}(${comp.vλl},${paramsName},${comp.args.εrr})`;
    const infoCode = `{name:${toLiteral(formatName)},invalid:${errVarName}}`;
    const callJitErr = `if (${errVarName}) utl.err(${comp.args.εrr},${comp.args.pλth},[${pathItems}],${expectLiteral},${infoCode});`;
    return `${errorPureFnCall};${callJitErr}`;
}

export function compilePureFunctionContext(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    pureFn: PureFunctionWithContext<any>,
    params: TypeFormatParams | string[],
    ignoreProps?: string[]
): {fnName: string; paramsName: string} {
    const name = pureFn.name;
    if (!name) throw new Error('Pure function must have a name');
    registerPureFunctionWithCtx(pureFn); // will throw if there is a different pure function with the same name
    comp.addPureFnDependency(pureFn);
    // Add context code for the pure function and params
    const fnName = `${name}${rt.getNestLevel()}`;
    const pureFunctionCode = `const ${fnName} = utl.getPureFn(${toLiteral(name)})`;
    comp.contextCodeItems.set(fnName, pureFunctionCode);
    const {paramsName} = compileAddParamsToCtx(comp, rt, params, ignoreProps);
    return {fnName, paramsName};
}

export function compileAddParamsToCtx(
    comp: JitCompiler | JitErrorsCompiler,
    rt: BaseRunType,
    params: TypeFormatParams | string[],
    ignoreProps?: string[]
): {paramsName: string} {
    if (Array.isArray(params)) return {paramsName: params.map((p) => toLiteral(p)).join('.')};
    const paramsName = `args${rt.getNestLevel()}`; //TODO: we might need to add a name based on the type formatter
    if (comp.contextCodeItems.has(paramsName)) return {paramsName};
    const paramsCode = `const ${paramsName} = ${typeParamsToLiteral(params, ignoreProps)}`;
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
