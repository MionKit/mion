/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithJitFns, AnyFn, JitCompiledFunctions} from '@mionkit/core';
import {
    type FunctionRunType,
    type BaseRunType,
    type MemberRunType,
    type RunTypeOptions,
    JitFunctions,
    reflectFunction,
    JitFnCompiler,
    isUnionRunType,
    isClassRunType,
    isLiteralRunType,
    isNeverRunType,
} from '@mionkit/run-types';
import {Handler} from '../types/handlers';
import {RouterOptions} from '../types/general';
import {DEFAULT_ROUTE_OPTIONS, HEADER_HOOK_DEFAULT_PARAMS, ROUTE_DEFAULT_PARAMS} from '../constants';
import {EMPTY_HASH, HeadersSubset} from '@mionkit/core';

// ############ This file should be the only one importing '@mionkit/run-types' within the router ########
// TODO: in the future we can load things from cache and load run types only when needed

type MethodReflect = Omit<MethodWithJitFns, 'id' | 'type' | 'nestLevel' | 'pointer' | 'options'>;

// TODO: we do not want to use runtypes directly but compiled functions so we can take advantage
// of precompiled functions without having to generate JIT functions
// this way we also do not need to use new Function which is not allowed in some environments
export function getHandlerReflection(
    handler: Handler,
    routeId: string,
    routerOptions: RouterOptions,
    isHeaderHook: boolean = false
): MethodReflect {
    const reflectionItems: Partial<MethodReflect> = {};
    let handlerRunType: FunctionRunType;
    const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
    try {
        handlerRunType = reflectFunction(handler);
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/hook "${routeId}." Error: ${error?.message}`);
    }
    const paramsSlice = isHeaderHook ? {start: HEADER_HOOK_DEFAULT_PARAMS.length} : {start: ROUTE_DEFAULT_PARAMS.length};
    const paramsOpts: RunTypeOptions = {...runTypeOptions, paramsSlice};

    try {
        reflectionItems.paramNames = handlerRunType.getParameterNames(paramsOpts);
        // Skip JIT generation if handler has no params (optimization for AOT cache size)
        if (reflectionItems.paramNames.length === 0) {
            reflectionItems.paramsJitFns = nullJitFns;
            reflectionItems.paramsJitHash = EMPTY_HASH;
        } else {
            reflectionItems.paramsJitFns = getParamsJitFns(handler, paramsOpts);
            reflectionItems.paramsJitHash = handlerRunType.getParameters().getJitHash(paramsOpts);
        }
    } catch (error: any) {
        throw new Error(`Can not compile Jit Functions for Parameters of route/hook "${routeId}." Error: ${error?.message}`);
    }

    if (isHeaderHook) {
        const headersRunType = getParamsHeadersRunType(handlerRunType, routeId, routerOptions);
        const headerNames: string[] = getHeaderNames(headersRunType, routeId);

        try {
            const opts: RunTypeOptions = {
                ...runTypeOptions,
                paramsSlice: undefined,
            };

            const jitFns: JitCompiledFunctions = getJitFunctions(headersRunType, opts);
            const jitHash = headersRunType.getJitHash(opts);
            reflectionItems.headersParam = {headerNames, jitFns, jitHash};
        } catch (error: any) {
            throw new Error(`Can not compile Jit Functions for Headers of header hook "${routeId}." Error: ${error?.message}`);
        }
    }

    const returnHeadersRunType = getReturnHeadersRunType(handlerRunType);
    if (returnHeadersRunType) {
        const opts: RunTypeOptions = {};
        const headerNames: string[] = getHeaderNames(returnHeadersRunType, routeId);
        const jitFns: JitCompiledFunctions = getReturnJitFns(handler, opts);
        const jitHash: string = returnHeadersRunType.getJitHash(opts);
        reflectionItems.headersReturn = {headerNames, jitFns, jitHash};
    }

    const returnOpts: RunTypeOptions = runTypeOptions;
    // If the return type is HeadersSubset or if it's a headersHook with array return, don't treat it as return data
    reflectionItems.hasReturnData = handlerRunType.hasReturnData();

    try {
        // Skip JIT generation if handler has void return (optimization for AOT cache size)
        if (!reflectionItems.hasReturnData) {
            reflectionItems.returnJitFns = nullJitFns;
            reflectionItems.returnJitHash = EMPTY_HASH;
        } else {
            // returnJitFns contains all run type functionality for the return value, it compiles when the property is first accessed
            reflectionItems.returnJitFns = getReturnJitFns(handler, returnOpts);
            reflectionItems.returnJitHash = handlerRunType.getReturnType().getJitHash(returnOpts);
        }
    } catch (error: any) {
        throw new Error(`Can not get Jit Functions for Return of route/hook "${routeId}." Error: ${error?.message}`);
    }

    reflectionItems.isAsync = handlerRunType.isAsync();

    return reflectionItems as MethodReflect;
}

/**
 * Raw hooks don't use reflection, but must comply with the Method interface
 * @returns
 */
export function getRawMethodReflection(handler: Handler, routeId: string): MethodReflect {
    let handlerRunType: FunctionRunType;
    try {
        handlerRunType = reflectFunction(handler);
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/hook "${routeId}." Error: ${error?.message}`);
    }
    const reflectionItems: MethodReflect = {
        paramNames: [],
        paramsJitFns: nullJitFns,
        returnJitFns: nullJitFns,
        paramsJitHash: '',
        returnJitHash: '',
        hasReturnData: false,
        isAsync: handlerRunType.isAsync(),
    };
    return reflectionItems;
}

function getParamsHeadersRunType(handlerRunType: FunctionRunType, routeId: string, routerOptions: RouterOptions): BaseRunType {
    const paramRunTypes = handlerRunType.getParameters().getParamRunTypes(getFakeCompiler(routerOptions));
    const headersSubset = (paramRunTypes[1] as MemberRunType<any>)?.getMemberType?.(); // HeadersSubset is always index 1 after context

    if (!isHeaderSubSetRunType(headersSubset)) {
        throw new Error(`Header Hook '${routeId}' second parameter must be a HeadersSubset.`);
    }
    return headersSubset;
}

function getReturnHeadersRunType(handlerRunType: FunctionRunType): BaseRunType | undefined {
    const returnRunType = handlerRunType.getReturnType();
    if (isUnionRunType(returnRunType)) {
        const headersSubset = returnRunType.getChildRunTypes().find(isHeaderSubSetRunType);
        if (!headersSubset) return undefined;
        return headersSubset;
    }
    if (!isHeaderSubSetRunType(returnRunType)) return undefined;
    return returnRunType;
}

function isHeaderSubSetRunType(rt: BaseRunType | undefined): rt is BaseRunType {
    if (!rt) return false;
    return isClassRunType(rt, HeadersSubset);
}

function getHeaderNames(rt: BaseRunType, routeId: string): string[] {
    // HeadersSubset is a generic class: HeadersSubset<Required, Optional>
    // We need to extract the literal string values from the Required and Optional type arguments
    // Use 'typeArguments' (not 'arguments') to get both Required and Optional with their defaults
    const typeArguments = (rt.src as any).typeArguments;
    if (!typeArguments || typeArguments.length === 0) {
        throw new Error(`HeadersSubset must have type arguments in route/hook ${routeId}`);
    }
    const headerNames: string[] = [];
    // Extract header names from Required type argument (first argument)
    const requiredArg = typeArguments[0];
    if (requiredArg) {
        const requiredNames = extractLiteralStringsFromType(requiredArg._rt);
        headerNames.push(...requiredNames);
    }
    // Extract header names from Optional type argument (second argument, if present)
    if (typeArguments.length > 1) {
        const optionalArg = typeArguments[1];
        if (optionalArg) {
            const optionalNames = extractLiteralStringsFromType(optionalArg._rt);
            headerNames.push(...optionalNames);
        }
    }
    if (headerNames.length === 0) {
        throw new Error(`Header names array cannot be empty in route/hook ${routeId}`);
    }
    return headerNames;
}

/**
 * Internal recursive function to extract literal string values from a type.
 * Handles single literal strings and union types (including nested unions).
 */
function extractLiteralStringsFromTypeRecursive(rt: BaseRunType): string[] {
    // Handle single literal string
    if (isLiteralRunType(rt)) {
        const literal = (rt as any).getLiteralValue();
        if (typeof literal === 'string') {
            return [literal];
        }
        return [];
    }

    // Handle union of literal strings (recursively for nested unions)
    if (isUnionRunType(rt)) {
        const children = rt.getChildRunTypes();
        const literals: string[] = [];
        for (const child of children) {
            // Recursively extract from each child (handles nested unions)
            const childLiterals = extractLiteralStringsFromTypeRecursive(child);
            literals.push(...childLiterals);
        }
        return literals;
    }

    return [];
}

/**
 * Extracts literal string values from a type.
 * Handles 'never' type only at the root level, then delegates to recursive extraction.
 */
function extractLiteralStringsFromType(rt: BaseRunType): string[] {
    // Handle 'never' type at root level only (no headers)
    if (isNeverRunType(rt)) return [];
    return extractLiteralStringsFromTypeRecursive(rt);
}

// Create a fake compiler object with just the opts property needed by getParamRunTypes.
// getParamRunTypes() requires a JitFnCompiler but we only need the opts property to slice parameters.
// This is a workaround to avoid updating getParamRunTypes() signature
function getFakeCompiler(routerOptions: RouterOptions): JitFnCompiler {
    return {opts: routerOptions} as any as JitFnCompiler;
}

function getJitFunctions(rt: BaseRunType, opts?: RunTypeOptions): JitCompiledFunctions {
    const jitFns: JitCompiledFunctions = {
        isType: rt.createJitCompiledFunction(JitFunctions.isType.id, undefined, opts),
        typeErrors: rt.createJitCompiledFunction(JitFunctions.typeErrors.id, undefined, opts),
        prepareForJson: rt.createJitCompiledFunction(JitFunctions.prepareForJson.id, undefined, opts),
        restoreFromJson: rt.createJitCompiledFunction(JitFunctions.restoreFromJson.id, undefined, opts),
        stringifyJson: rt.createJitCompiledFunction(JitFunctions.stringifyJson.id, undefined, opts),
        toBinary: rt.createJitCompiledFunction(JitFunctions.toBinary.id, undefined, opts),
        fromBinary: rt.createJitCompiledFunction(JitFunctions.fromBinary.id, undefined, opts),
    };
    return jitFns;
}

function getParamsJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JitCompiledFunctions {
    const rt = reflectFunction(fn);
    const paramFunctions: JitCompiledFunctions = {
        isType: rt.createJitCompiledParamsFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledParamsFunction(JitFunctions.typeErrors, opts),
        prepareForJson: rt.createJitCompiledParamsFunction(JitFunctions.prepareForJson, opts),
        restoreFromJson: rt.createJitCompiledParamsFunction(JitFunctions.restoreFromJson, opts),
        stringifyJson: rt.createJitCompiledParamsFunction(JitFunctions.stringifyJson, opts),
        toBinary: rt.createJitCompiledParamsFunction(JitFunctions.toBinary, opts),
        fromBinary: rt.createJitCompiledParamsFunction(JitFunctions.fromBinary, opts),
    };
    return paramFunctions;
}

function getReturnJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JitCompiledFunctions {
    const rt = reflectFunction(fn);

    const returnFunctions: JitCompiledFunctions = {
        isType: rt.createJitCompiledReturnFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledReturnFunction(JitFunctions.typeErrors, opts),
        prepareForJson: rt.createJitCompiledReturnFunction(JitFunctions.prepareForJson, opts),
        restoreFromJson: rt.createJitCompiledReturnFunction(JitFunctions.restoreFromJson, opts),
        stringifyJson: rt.createJitCompiledReturnFunction(JitFunctions.stringifyJson, opts),
        toBinary: rt.createJitCompiledReturnFunction(JitFunctions.toBinary, opts),
        fromBinary: rt.createJitCompiledReturnFunction(JitFunctions.fromBinary, opts),
    };
    return returnFunctions;
}

// prettier-ignore
export const nullJitFns: JitCompiledFunctions = {
    isType: fakeJitFn(),
    typeErrors: fakeJitFn(),
    prepareForJson: fakeJitFn(),
    restoreFromJson: fakeJitFn(),
    stringifyJson: fakeJitFn(),
    toBinary: fakeJitFn(),
    fromBinary: fakeJitFn(),
} as any;

function fakeJitFn(): (...args: any[]) => any {
    return () => {
        throw new Error(
            'Raw Hooks and Handlers with no params or void return do not have JIT functions and should not be called.'
        );
    };
}
