/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PureFunctionClosure, TypeFormatParams, TypeFormatValue} from '@mionkit/core';
import {ReflectionKindName} from '../constants.kind.ts';
import type {FormatAnnotation} from '../types.ts';
import {typeAnnotation, ReflectionKind} from '@deepkit/type';
import type {BaseRunType} from './baseRunTypes.ts';
import type {JitErrorsFnCompiler, JitFnCompiler} from './jitFnCompiler.ts';
import type {BaseRunTypeFormat} from './baseRunTypeFormat.ts';
import {toLiteralInContext} from './utils.ts';

// ################# REGISTER FORMATTERS & PURE FUNCTIONS  #################

const typeAnnotationsCache = new Map<string, BaseRunTypeFormat>();
const formatterPrefix = 'f';

/** Adds a TypeFormatter or TypeValidator to the formatters cache */
export function registerFormatter<T extends BaseRunTypeFormat>(operation: T, shouldThrow = false): T {
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

/** Gets a TypeFormatter or TypeValidator to the formatters cache */
export function getFormatterFromCache(
    typeKind: ReflectionKind,
    name: string,
    shouldThrow = false
): BaseRunTypeFormat | undefined {
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

/** Returns the validator for a given type. ATM only one validator is allowed for each type */
export function getRunTypeFormat(rt: BaseRunType): BaseRunTypeFormat | undefined {
    return getFormatAnnotation(rt)?.formatter;
}

export function getRunTypeTransformer(rt: BaseRunType): BaseRunTypeFormat | undefined {
    const rtFormat = getRunTypeFormat(rt);
    if (rtFormat?.emitFormat) return rtFormat;
    return undefined;
}

// ################# ANNOTATIONS  #################

/**
 * Reads deepkit annotations and augment them with the associated formatters.
 * @param rt
 * @returns
 */
export function initFormatAnnotations(rt: BaseRunType): FormatAnnotation | undefined {
    const annotations = typeAnnotation.getAnnotations(rt.src);
    if (annotations.length === 0) return;
    if (annotations.length > 1)
        throw new Error(`Only one type annotation is allowed for runTypes and ${rt.getTypeName()} has ${annotations.length}`);
    const annotation = annotations[0] as FormatAnnotation;
    if (!annotation.name) throw new Error(`Type annotation must have a name for ${rt.getTypeName()}`);
    const params = annotation.options;
    const formatter = getFormatterFromCache(rt.src.kind, annotation.name);
    // formatter property is only added to registered formatters, this allows using other type annotations that are not formatters
    if (formatter && params.kind === ReflectionKind.objectLiteral) {
        annotation.formatter = formatter;
        return annotation;
    }
    return annotation as FormatAnnotation;
}

/** Returns the params for a given type formatter */
export function getFormatterParams<P extends TypeFormatParams>(rt: BaseRunType, fmtName: string): P {
    const annotation = getFormatAnnotation(rt);
    if (annotation?.name === fmtName) {
        if (annotation.params) return annotation.params as P;
        annotation.params = typeAnnotation.getOption(rt.src, annotation.name) as P;
        return annotation.params as P;
    }
    throw new Error(`Type Formatter ${fmtName} not found for ${rt.getTypeName()}`);
}

export function getFormatAnnotation(rt: BaseRunType): FormatAnnotation | undefined {
    const parsedAnnotations = typeAnnotation.getAnnotations(rt.src);
    const formatAnnotations = parsedAnnotations.filter((a) => (a as FormatAnnotation).formatter);
    return formatAnnotations[0] as FormatAnnotation | undefined;
}

// ################# COMPILING  #################

// TODO, read ignoreProps from multiple formatters, rather than a constant here
export const defaultIgnoreFormatProps = ['mockSamples'];

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
export function paramsToLiteral(comp: JitFnCompiler | JitErrorsFnCompiler, params: TypeFormatValue, ignoreProps?: string[]) {
    return toLiteralInContext(comp, params, ignoreProps, false);
}

export function getToLiteralFn(comp: JitFnCompiler | JitErrorsFnCompiler, ignoreProps?: string[]) {
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
    comp: JitFnCompiler | JitErrorsFnCompiler,
    params: Record<string, string | PureFunctionClosure>,
    ignoreProps: string[] = []
) {
    return toLiteralInContext(comp, params, ignoreProps, true);
}
