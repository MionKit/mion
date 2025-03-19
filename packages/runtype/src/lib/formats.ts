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
    PureFunctionWithClosure,
    TypeFormatParams,
    TypeFormatValue,
} from '../types';
import {typeAnnotation, ReflectionKind} from '@deepkit/type';
import type {BaseRunType} from './baseRunTypes';
import {JitErrorsCompiler, type JitCompiler} from './jitCompiler';
import {JitRunTypeFormatter} from './baseFormatter';
import {jitUtils} from './jitUtils';
import {isSafePropName, toLiteral} from './utils';
import {createUniqueHash} from './quickHash';

// ################# REGISTER FORMATTERS & PURE FUNCTIONS  #################

const typeAnnotationsCache = new Map<string, JitRunTypeFormatter>();
const formatterPrefix = 'f';
// small has size to reduce var names length, as collisions are managed by createUniqueHash thats is ok
const hashSize = 6;

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

export function registerPureFnClosure(
    fnWithCtx: PureFunctionWithClosure<any>,
    dependencies?: PureFunctionWithClosure<any>[]
): CompiledPureFunction {
    const existing = jitUtils.getCompiledPureFn(fnWithCtx.name);
    if (existing && existing.originClosureFn && existing.originClosureFn !== fnWithCtx)
        throw new Error(`Pure function with name ${fnWithCtx.name} already exists`);
    if (existing) return existing;
    const compiled = parsePureFunctionWithCtx(fnWithCtx);
    if (dependencies) {
        dependencies.forEach((d) => registerPureFnClosure(d));
        dependencies.forEach((d) => compiled.dependencies.add(d.name));
    }
    jitUtils.addPureFn(compiled);
    return compiled;
}

export function registerPureFnClosuresGroup(fnsWithCtx: PureFunctionWithClosure<any>[]): CompiledPureFunction[] {
    const compiledFns = fnsWithCtx.map((fn) => registerPureFnClosure(fn));
    compiledFns.forEach((cfn) => {
        compiledFns.forEach((cf) => {
            if (cfn.name === cf.name) return;
            cf.dependencies.add(cfn.name);
        });
    });
    return compiledFns;
}

export function getPureFn(fnOrName: string | PureFunctionWithClosure<any>): PureFunction<TypeFormatParams> | undefined {
    if (typeof fnOrName === 'string') return jitUtils.getPureFn(fnOrName);
    const name = fnOrName.name;
    if (!name) throw new Error('Pure Functions must have a name');
    return jitUtils.getPureFn(name);
}

export function getCompiledPureFn(fnOrName: string | PureFunctionWithClosure<any>): CompiledPureFunction | undefined {
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

function parsePureFunctionWithCtx(closureFn: PureFunctionWithClosure<any>): CompiledPureFunction {
    if (!closureFn.name) throw new Error('Pure Functions must have a name');

    const fnString = closureFn.toString();
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
    const compiled: CompiledPureFunction = {
        originClosureFn: closureFn,
        fn: null as any, // will be set later so all possible dependencies are resolved
        name: closureFn.name,
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
    pureFn: PureFunctionWithClosure<any>,
    params?: TypeFormatValue,
    dependenciesParams?: Record<string, string>
): {callCode: string; fnName: string; paramsName: string; dependenciesName?: string} {
    const fnName = compilePureFunctionContext(comp, pureFn);
    const {paramsName, dependenciesName} = compileAddParamsToCtx(
        comp,
        params || ft.getParams(rt),
        ft.ignoreJitParams,
        dependenciesParams
    );
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    const depsCode = dependenciesName ? `,${dependenciesName}` : '';
    return {callCode: `${fnName}(${comp.vλl},${paramsName}${depsCode})`, fnName, paramsName, dependenciesName};
}

export function compileErrorsPureFunctionCall(
    comp: JitErrorsCompiler,
    rt: BaseRunType,
    ft: JitRunTypeFormatter,
    pureFn: PureFunctionWithClosure<any>,
    params?: TypeFormatValue,
    dependenciesParams?: Record<string, string | PureFunctionWithClosure<any>>
): {callCode: string; fnName: string; paramsName: string; dependenciesName?: string} {
    const fnName = compilePureFunctionContext(comp, pureFn);
    const {paramsName, dependenciesName, formatPathName} = compileAddParamsToCtx(
        comp,
        params || ft.getParams(rt),
        ft.ignoreJitParams,
        dependenciesParams,
        ft.parentPath || []
    );
    const pathItems = comp.getStackStaticPathArgs();
    const expectLiteral = toLiteral(rt.getKindName());
    // call the pure function, passing value, jitUtils and params (pure function arguments)
    const pureFnParams = [comp.vλl, paramsName, formatPathName, '[]', toLiteral(ft.name)]; // ErrorsPureFunction params [value, params, path, formatPath, formatName]
    if (dependenciesName) pureFnParams.push(dependenciesName);
    const errParams = [comp.args.εrr, comp.args.pλth, `[${pathItems}]`, expectLiteral]; // jitUtils.err parameters
    const callJitErr = `${fnName}(${pureFnParams.join(',')}).forEach((fmtErr) => utl.err(${errParams.join()},fmtErr));`;
    return {callCode: callJitErr, fnName, paramsName, dependenciesName};
}

export function compilePureFunctionContext(comp: JitCompiler | JitErrorsCompiler, pureFn: PureFunctionWithClosure<any>): string {
    const fnName = pureFn.name;
    if (!fnName) throw new Error('Pure function must have a name');
    registerPureFnClosure(pureFn); // will throw if there is a different pure function with the same name
    if (comp.contextCodeItems.has(fnName)) return fnName;
    comp.addPureFnDependency(pureFn);
    // Add context code for the pure function and params
    const pureFunctionCode = `const ${fnName} = utl.getPureFn(${toLiteral(fnName)})`;
    comp.contextCodeItems.set(fnName, pureFunctionCode);
    return fnName;
}

export function compileAddParamsToCtx(
    comp: JitCompiler | JitErrorsCompiler,
    params: TypeFormatValue,
    ignoreJitParams?: string[],
    dependenciesParams?: Record<string, string | PureFunctionWithClosure<any>>,
    path?: (string | number)[]
): {paramsName: string; dependenciesName?: string; formatPathName?: string} {
    const literal = typeParamsToLiteral(comp, params, ignoreJitParams || []);
    const hash = createUniqueHash('ar-' + literal, hashSize);
    const paramsName = `ar${hash}`; //TODO: we might need to add a name based on the type formatter;
    let dependenciesName: string | undefined = undefined;
    let formatPathName: string | undefined = undefined;

    if (!comp.contextCodeItems.has(paramsName)) {
        const paramsCode = `const ${paramsName} = ${literal}`;
        comp.contextCodeItems.set(paramsName, paramsCode);
    }
    if (dependenciesParams) {
        const dependenciesLiteral = objectToLiteral(comp, dependenciesParams, [], 'dc');
        dependenciesName = `de${createUniqueHash(('de-' + dependenciesLiteral) as string, hashSize)}`;
        if (!comp.contextCodeItems.has(dependenciesName)) {
            const dependenciesCode = `const ${dependenciesName} = ${dependenciesLiteral}`;
            comp.contextCodeItems.set(dependenciesName, dependenciesCode);
        }
    }
    if (path) {
        const pathLiteral = typeParamsToLiteral(comp, path, []);
        formatPathName = `pa${createUniqueHash('pa-' + pathLiteral, hashSize)}`;
        if (!comp.contextCodeItems.has(formatPathName)) {
            const pathCode = `const ${formatPathName} = ${pathLiteral}`;
            comp.contextCodeItems.set(formatPathName, pathCode);
        }
    }
    return {paramsName, dependenciesName, formatPathName};
}

export function getParamsHash(
    comp: JitCompiler | JitErrorsCompiler | undefined,
    params: TypeFormatValue,
    ignoreProps?: string[]
): string {
    const literal = typeParamsToLiteral(comp, params, ignoreProps || []);
    return createUniqueHash(literal, hashSize);
}

// TODO, read ignoreProps from multiple formatters, rather than a constant here
export const defaultIgnoreFormatProps = ['samples', 'sampleChars'];

/**
 * Transforms a params object into a literal string to be used in JIT code.
 * // TODO: we might want to cache the generated jit code for the params
 * @param params
 * @param ignoreProps
 * @returns
 */
export function typeParamsToLiteral(
    comp: JitCompiler | JitErrorsCompiler | undefined,
    params: TypeFormatValue,
    ignoreProps: string[]
): string {
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
            return `[${params.map((v) => typeParamsToLiteral(comp, v, ignoreProps)).join(', ')}]`;
        case typeof params === 'object': {
            return objectToLiteral(comp, params, ignoreProps, 'l');
        }
        default:
            throw new Error(`Unsupported type format params ${params}`);
    }
}

function objectToLiteral(
    comp: JitCompiler | JitErrorsCompiler | undefined,
    obj: Record<string, any>,
    ignoreProps: string[],
    propType: 'l' | 'dc'
): string {
    const entriesLiterals = Object.entries(obj).map(([k, v]) => {
        if (ignoreProps.includes(k) || typeof v === 'undefined') return undefined;
        const propName = isSafePropName(k) ? k : toLiteral(k);
        return `${propName}:${propValueToLiteral(comp, v, ignoreProps, propType)}`;
    });
    return `{${entriesLiterals.filter(Boolean).join(',')}}`;
}

function propValueToLiteral(
    comp: JitCompiler | JitErrorsCompiler | undefined,
    propVal: any,
    ignoreProps: string[],
    propType: 'l' | 'dc'
): string {
    switch (propType) {
        case 'l':
            return typeParamsToLiteral(comp, propVal, ignoreProps);
        case 'dc':
            if (typeof propVal === 'function') {
                if (!comp) throw new Error('Dependencies must be pure functions or code');
                comp.addPureFnDependency(propVal);
                return `utl.getPureFn(${toLiteral(propVal.name)})`;
            }
            if (typeof propVal === 'string') return propVal;
            throw new Error('Dependencies must be pure functions or code');
    }
}
