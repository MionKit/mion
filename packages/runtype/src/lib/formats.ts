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
import type {JitErrorsCompiler, JitCompiler} from './jitCompiler';
import type {JitRunTypeFormatter} from './baseFormatter';
import {jitUtils} from './jitUtils';
import {toLiteral, toLiteralInContext} from './utils';

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

export function registerPureFnClosure(
    fnWithCtx: PureFunctionWithClosure,
    dependencies?: PureFunctionWithClosure[]
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

export function registerPureFnClosuresGroup(fnsWithCtx: PureFunctionWithClosure[]): CompiledPureFunction[] {
    const compiledFns = fnsWithCtx.map((fn) => registerPureFnClosure(fn));
    compiledFns.forEach((cfn) => {
        compiledFns.forEach((cf) => {
            if (cfn.name === cf.name) return;
            cf.dependencies.add(cfn.name);
        });
    });
    return compiledFns;
}

export function getPureFn(fnOrName: string | PureFunctionWithClosure): PureFunction | undefined {
    if (typeof fnOrName === 'string') return jitUtils.getPureFn(fnOrName);
    const name = fnOrName.name;
    if (!name) throw new Error('Pure Functions must have a name');
    return jitUtils.getPureFn(name);
}

export function getCompiledPureFn(fnOrName: string | PureFunctionWithClosure): CompiledPureFunction | undefined {
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

function parsePureFunctionWithCtx(closureFn: PureFunctionWithClosure): CompiledPureFunction {
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

export function compileAddPureFunctionContext(comp: JitCompiler | JitErrorsCompiler, pureFn: PureFunctionWithClosure): string {
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

// TODO, read ignoreProps from multiple formatters, rather than a constant here
export const defaultIgnoreFormatProps = ['samples', 'sampleChars'];

/**
 * Transforms a params object into a literal string to be used in JIT code.
 * ie: {total: 5, name: 'hello'} gets transformed into teh string '{total: 5, name: "hello"}' that can be used as JIT code.
 * Some literals are automatically added to the context to reduce code size. in this case the reference to the context variable is returned.
 *
 * @param comp
 * @param params
 * @param ignoreProps
 * @returns
 */
export function paramsToLiteral(comp: JitCompiler | JitErrorsCompiler, params: TypeFormatValue, ignoreProps: string[] = []) {
    return toLiteralInContext(comp, params, ignoreProps, false);
}

export function getToLiteralFn(comp: JitCompiler | JitErrorsCompiler, ignoreProps: string[] = []) {
    return (params: TypeFormatValue) => paramsToLiteral(comp, params, ignoreProps);
}

/**
 * Transforms a dependencies object into a string literal that can be used as JIT code.
 * Dependencies object can contain pure functions or code.
 * Pure functions will be load as dependency using jitUtils.getPureFn, and code will be left as is.
 * ie: {helloFn: function hello(){}, code: 'v + 2'} gets transformed into the string '{helloFn: utl.getPureFn("hello"), code: v + 2}'
 * @param comp
 * @param params
 * @param ignoreProps
 * @returns
 */
export function dependenciesToLiteral(
    comp: JitCompiler | JitErrorsCompiler,
    params: Record<string, string | PureFunctionWithClosure>,
    ignoreProps: string[] = []
) {
    return toLiteralInContext(comp, params, ignoreProps, true);
}
