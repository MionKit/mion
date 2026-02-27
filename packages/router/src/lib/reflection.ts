/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {MethodWithJitFns, AnyFn, JitCompiledFunctions, MethodMetadata} from '@mionkit/core';
// Type-only imports from run-types - these don't load the module at runtime
import type {FunctionRunType, BaseRunType, MemberRunType, RunTypeOptions, JitFnCompiler} from '@mionkit/run-types';
import {Handler} from '../types/handlers.ts';
import {RouterOptions} from '../types/general.ts';
import {DEFAULT_ROUTE_OPTIONS, HEADER_HOOK_DEFAULT_PARAMS, ROUTE_DEFAULT_PARAMS} from '../constants.ts';
import {EMPTY_HASH, HeadersSubset, getJitFunctionsFromHash, getNoopJitFns} from '@mionkit/core';
import {getPersistedMethodMetadata} from './methodsCache.ts';

// ############ This file is the only one importing '@mionkit/run-types' within the router ########
// In AOT mode, run-types is NOT loaded - all reflection data comes from the AOT cache

type MethodReflect = Omit<MethodWithJitFns, 'id' | 'type' | 'nestLevel' | 'pointer' | 'options'>;

// ############ AOT Cache Error ############

/**
 * Error thrown when AOT mode is enabled but required data is missing from the AOT cache.
 * This indicates that the AOT caches need to be regenerated using 'mion-build-aot' command.
 */
export class AOTCacheError extends Error {
    constructor(routeId: string, type: 'route' | 'middleFn' | 'rawMiddleFn' = 'route') {
        const typeLabel = type === 'rawMiddleFn' ? 'Raw middleFn' : type === 'middleFn' ? 'MiddleFn' : 'Route/middleFn';
        super(`${typeLabel} "${routeId}" not found in AOT cache.\n` + `Regenerate AOT caches using 'mion-build-aot' command.`);
        this.name = 'AOTCacheError';
    }
}

// ############ Run-Types Module Loading ############
type RunTypesModule = typeof import('@mionkit/run-types');
// Type definition for the dynamically imported run-types module
interface RunTypesFunctions {
    JitFunctions: RunTypesModule['JitFunctions'];
    reflectFunction: RunTypesModule['reflectFunction'];
    isUnionRunType: RunTypesModule['isUnionRunType'];
    isClassRunType: RunTypesModule['isClassRunType'];
    isLiteralRunType: RunTypesModule['isLiteralRunType'];
    isNeverRunType: RunTypesModule['isNeverRunType'];
}

// Cached run-types module - loaded once and reused
let runTypesModule: RunTypesFunctions | null = null;
let runTypesLoadPromise: Promise<RunTypesFunctions> | null = null;

/** Dynamically loads the @mionkit/run-types module. The module is cached after first load. */
async function loadRunTypesModule(): Promise<RunTypesFunctions> {
    // Return cached module if already loaded
    if (runTypesModule) return runTypesModule;

    // Return existing promise if load is in progress
    if (runTypesLoadPromise) return runTypesLoadPromise;

    // Start loading the module
    runTypesLoadPromise = import('@mionkit/run-types').then((module) => {
        runTypesModule = {
            JitFunctions: module.JitFunctions,
            reflectFunction: module.reflectFunction,
            isUnionRunType: module.isUnionRunType,
            isClassRunType: module.isClassRunType,
            isLiteralRunType: module.isLiteralRunType,
            isNeverRunType: module.isNeverRunType,
        };
        return runTypesModule;
    });

    return runTypesLoadPromise;
}

/** Resets the run-types module cache. Useful for testing purposes only. */
export function resetRunTypesCache(): void {
    runTypesModule = null;
    runTypesLoadPromise = null;
}

/** Resets all reflection caches. Useful for testing purposes only. */
export function resetReflectionCaches(): void {
    rawMiddleFnReflectionCache.clear();
    // Note: functionRunTypeCache uses WeakMap so it doesn't need explicit clearing
    // Note: _cachedReflection on MethodMetadata objects will be cleared when persistedMethods is reset
}

// ############ Raw MiddleFn Reflection Helper ############

// Cache for common raw middleFn reflections
const rawMiddleFnReflectionCache = new Map<string, MethodReflect>();

/**
 * Creates a MethodReflect for raw middleFns.
 * Raw middleFns don't need JIT functions - they always use NoopJitFns.
 * Results are cached to avoid creating duplicate objects.
 */
function createRawMiddleFnReflection(isAsync: boolean, hasReturnData: boolean = false, paramNames: string[] = []): MethodReflect {
    // Create cache key from parameters
    const cacheKey = `${isAsync}_${hasReturnData}_${paramNames.join(',')}`;

    const cached = rawMiddleFnReflectionCache.get(cacheKey);
    if (cached) return cached;

    const reflection: MethodReflect = {
        paramNames,
        paramsJitFns: getNoopJitFns(),
        returnJitFns: getNoopJitFns(),
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        hasReturnData,
        isAsync,
    };

    rawMiddleFnReflectionCache.set(cacheKey, reflection);
    return reflection;
}

// ############ AOT Cache Extraction ############

// Extend MethodMetadata type to include cached reflection
type CachedMethodMetadata = MethodMetadata & {
    _cachedReflection?: MethodReflect;
};

/**
 * Extracts reflection data from a cached method.
 * Used in AOT mode to restore method reflection without loading run-types.
 * Results are cached on the metadata object to avoid creating duplicate objects.
 */
function extractReflectionFromCached(cached: CachedMethodMetadata): MethodReflect {
    // Return cached reflection if available
    if (cached._cachedReflection) return cached._cachedReflection;

    const reflectionItems: MethodReflect = {
        paramNames: cached.paramNames || [],
        paramsJitFns: getJitFunctionsFromHash(cached.paramsJitHash),
        returnJitFns: getJitFunctionsFromHash(cached.returnJitHash),
        paramsJitHash: cached.paramsJitHash,
        returnJitHash: cached.returnJitHash,
        hasReturnData: cached.hasReturnData,
        isAsync: cached.isAsync,
    };

    // Restore headers param if present
    if (cached.headersParam) {
        reflectionItems.headersParam = {
            headerNames: cached.headersParam.headerNames,
            jitFns: getJitFunctionsFromHash(cached.headersParam.jitHash) as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>,
            jitHash: cached.headersParam.jitHash,
        };
    }

    // Restore headers return if present
    if (cached.headersReturn) {
        reflectionItems.headersReturn = {
            headerNames: cached.headersReturn.headerNames,
            jitFns: getJitFunctionsFromHash(cached.headersReturn.jitHash) as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>,
            jitHash: cached.headersReturn.jitHash,
        };
    }

    // Cache for future calls
    cached._cachedReflection = reflectionItems;
    return reflectionItems;
}

// ############ Main Reflection Functions ############

/**
 * Gets reflection data for a handler (route or middleFn).
 * In AOT mode, returns cached data without loading run-types.
 * In non-AOT mode, dynamically loads run-types and generates reflection.
 * Throws AOTCacheError if AOT mode is enabled and route is not in cache.
 */
export async function getHandlerReflection(
    handler: Handler,
    routeId: string,
    routerOptions: RouterOptions,
    isHeadersMiddleFn: boolean = false
): Promise<MethodReflect> {
    // Check AOT cache first
    const cached = getPersistedMethodMetadata(routeId);
    if (cached) return extractReflectionFromCached(cached);
    if (routerOptions.aot) throw new AOTCacheError(routeId, isHeadersMiddleFn ? 'middleFn' : 'route');
    // Non-AOT mode: dynamically load run-types and generate reflection
    const rt = await loadRunTypesModule();
    return generateHandlerReflection(handler, routeId, routerOptions, isHeadersMiddleFn, rt);
}

/**
 * Gets reflection data for a raw middleFn.
 * Raw middleFns don't use full reflection - they don't need JIT functions.
 * Raw middleFns don't NEED to be in the AOT cache, but if they are, we can use
 * the cached data (especially the isAsync flag).
 * In AOT mode, this function does NOT load run-types.
 */
export async function getRawMethodReflection(
    handler: Handler,
    routeId: string,
    routerOptions: RouterOptions
): Promise<MethodReflect> {
    // Check if raw middleFn is in cache - if so, use cached data (especially isAsync)
    const cached = getPersistedMethodMetadata(routeId);
    if (cached) return createRawMiddleFnReflection(cached.isAsync, cached.hasReturnData, cached.paramNames || []);
    // Raw middleFns don't need JIT functions, so we don't need to load run-types in AOT mode
    if (routerOptions.aot) return createRawMiddleFnReflection(true);
    // Non-AOT mode: dynamically load run-types to properly detect if handler is async
    const rt = await loadRunTypesModule();
    return generateRawMethodReflection(handler, routeId, rt);
}

// ############ Reflection Generation (requires run-types) ############

/**
 * Generates reflection data for a handler using run-types.
 * This function is only called in non-AOT mode.
 */
function generateHandlerReflection(
    handler: Handler,
    routeId: string,
    routerOptions: RouterOptions,
    isHeadersMiddleFn: boolean,
    rt: RunTypesFunctions
): MethodReflect {
    const reflectionItems: Partial<MethodReflect> = {};
    let handlerRunType: FunctionRunType;
    const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
    try {
        handlerRunType = rt.reflectFunction(handler);
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    const paramsSlice = isHeadersMiddleFn ? {start: HEADER_HOOK_DEFAULT_PARAMS.length} : {start: ROUTE_DEFAULT_PARAMS.length};
    const paramsOpts: RunTypeOptions = {...runTypeOptions, paramsSlice};

    try {
        reflectionItems.paramNames = handlerRunType.getParameterNames(paramsOpts);
        // Skip JIT generation if handler has no params (optimization for AOT cache size)
        if (reflectionItems.paramNames.length === 0) {
            reflectionItems.paramsJitHash = EMPTY_HASH;
            reflectionItems.paramsJitFns = getNoopJitFns();
        } else {
            reflectionItems.paramsJitFns = getFunctionJitFns(handler, paramsOpts, rt, false);
            reflectionItems.paramsJitHash = handlerRunType.getParameters().getJitHash(paramsOpts);
        }
    } catch (error: any) {
        throw new Error(`Can not compile Jit Functions for Parameters of route/middleFn "${routeId}." Error: ${error?.message}`);
    }

    if (isHeadersMiddleFn) {
        const headersRunType = getParamsHeadersRunType(handlerRunType, routeId, routerOptions, rt);
        const headerNames: string[] = getHeaderNames(headersRunType, routeId, rt);

        try {
            const opts: RunTypeOptions = {
                ...runTypeOptions,
                paramsSlice: undefined,
            };

            const jitFns: JitCompiledFunctions = getTypeJitFunctions(headersRunType, opts, rt);
            const jitHash = headersRunType.getJitHash(opts);
            reflectionItems.headersParam = {headerNames, jitFns, jitHash};
        } catch (error: any) {
            throw new Error(
                `Can not compile Jit Functions for Headers of Headers MiddleFn "${routeId}." Error: ${error?.message}`
            );
        }
    }

    const returnHeadersRunType = getReturnHeadersRunType(handlerRunType, rt);
    if (returnHeadersRunType) {
        const opts: RunTypeOptions = {};
        const headerNames: string[] = getHeaderNames(returnHeadersRunType, routeId, rt);
        const jitFns: JitCompiledFunctions = getFunctionJitFns(handler, opts, rt, true);
        const jitHash: string = returnHeadersRunType.getJitHash(opts);
        reflectionItems.headersReturn = {headerNames, jitFns, jitHash};
    }

    const returnOpts: RunTypeOptions = runTypeOptions;
    // If the return type is HeadersSubset or if it's a headersFn with array return, don't treat it as return data
    reflectionItems.hasReturnData = handlerRunType.hasReturnData();

    try {
        // Skip JIT generation if handler has void return (optimization for AOT cache size)
        if (!reflectionItems.hasReturnData) {
            reflectionItems.returnJitFns = getNoopJitFns();
            reflectionItems.returnJitHash = EMPTY_HASH;
        } else {
            // returnJitFns contains all run type functionality for the return value, it compiles when the property is first accessed
            reflectionItems.returnJitFns = getFunctionJitFns(handler, returnOpts, rt, true);
            reflectionItems.returnJitHash = handlerRunType.getReturnType().getJitHash(returnOpts);
        }
    } catch (error: any) {
        throw new Error(`Can not get Jit Functions for Return of route/middleFn "${routeId}." Error: ${error?.message}`);
    }

    reflectionItems.isAsync = handlerRunType.isAsync();

    return reflectionItems as MethodReflect;
}

/**
 * Generates reflection data for a raw middleFn using run-types.
 * This function is only called in non-AOT mode.
 */
function generateRawMethodReflection(handler: Handler, routeId: string, rt: RunTypesFunctions): MethodReflect {
    let handlerRunType: FunctionRunType;
    try {
        handlerRunType = rt.reflectFunction(handler);
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/middleFn "${routeId}." Error: ${error?.message}`);
    }
    const isAsync = handlerRunType?.isAsync() || true;
    return createRawMiddleFnReflection(isAsync);
}

// ############ Helper Functions (require run-types module) ############

function getParamsHeadersRunType(
    handlerRunType: FunctionRunType,
    routeId: string,
    routerOptions: RouterOptions,
    rt: RunTypesFunctions
): BaseRunType {
    const paramRunTypes = handlerRunType.getParameters().getParamRunTypes(getFakeCompiler(routerOptions));
    const headersSubset = (paramRunTypes[1] as MemberRunType<any>)?.getMemberType?.(); // HeadersSubset is always index 1 after context

    if (!isHeaderSubSetRunType(headersSubset, rt)) {
        throw new Error(`Headers MiddleFn '${routeId}' second parameter must be a HeadersSubset.`);
    }
    return headersSubset;
}

function getReturnHeadersRunType(handlerRunType: FunctionRunType, rt: RunTypesFunctions): BaseRunType | undefined {
    const returnRunType = handlerRunType.getReturnType();
    if (rt.isUnionRunType(returnRunType)) {
        const headersSubset = returnRunType.getChildRunTypes().find((child) => isHeaderSubSetRunType(child, rt));
        if (!headersSubset) return undefined;
        return headersSubset;
    }
    if (!isHeaderSubSetRunType(returnRunType, rt)) return undefined;
    return returnRunType;
}

function isHeaderSubSetRunType(runType: BaseRunType | undefined, rt: RunTypesFunctions): runType is BaseRunType {
    if (!runType) return false;
    return rt.isClassRunType(runType, HeadersSubset);
}

function getHeaderNames(runType: BaseRunType, routeId: string, rt: RunTypesFunctions): string[] {
    // HeadersSubset is a generic class: HeadersSubset<Required, Optional>
    // We need to extract the literal string values from the Required and Optional type arguments
    // Use 'typeArguments' (not 'arguments') to get both Required and Optional with their defaults
    const typeArguments = (runType.src as any).typeArguments;
    if (!typeArguments || typeArguments.length === 0) {
        throw new Error(`HeadersSubset must have type arguments in route/middleFn ${routeId}`);
    }
    const headerNames: string[] = [];
    // Extract header names from Required type argument (first argument)
    const requiredArg = typeArguments[0];
    if (requiredArg) {
        const requiredNames = extractLiteralStringsFromType(requiredArg._rt, rt);
        headerNames.push(...requiredNames);
    }
    // Extract header names from Optional type argument (second argument, if present)
    if (typeArguments.length > 1) {
        const optionalArg = typeArguments[1];
        if (optionalArg) {
            const optionalNames = extractLiteralStringsFromType(optionalArg._rt, rt);
            headerNames.push(...optionalNames);
        }
    }
    if (headerNames.length === 0) throw new Error(`Header names array cannot be empty in route/middleFn ${routeId}`);
    return headerNames;
}

/**
 * Internal recursive function to extract literal string values from a type.
 * Handles single literal strings and union types (including nested unions).
 */
function extractLiteralStringsFromTypeRecursive(runType: BaseRunType, rt: RunTypesFunctions): string[] {
    // Handle single literal string
    if (rt.isLiteralRunType(runType)) {
        const literal = (runType as any).getLiteralValue();
        if (typeof literal === 'string') {
            return [literal];
        }
        return [];
    }

    // Handle union of literal strings (recursively for nested unions)
    if (rt.isUnionRunType(runType)) {
        const children = runType.getChildRunTypes();
        const literals: string[] = [];
        for (const child of children) {
            // Recursively extract from each child (handles nested unions)
            const childLiterals = extractLiteralStringsFromTypeRecursive(child, rt);
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
function extractLiteralStringsFromType(runType: BaseRunType, rt: RunTypesFunctions): string[] {
    // Handle 'never' type at root level only (no headers)
    if (rt.isNeverRunType(runType)) return [];
    return extractLiteralStringsFromTypeRecursive(runType, rt);
}

// Create a fake compiler object with just the opts property needed by getParamRunTypes.
// getParamRunTypes() requires a JitFnCompiler but we only need the opts property to slice parameters.
// This is a workaround to avoid updating getParamRunTypes() signature
function getFakeCompiler(routerOptions: RouterOptions): JitFnCompiler {
    return {opts: routerOptions} as any as JitFnCompiler;
}

function getTypeJitFunctions(
    runType: BaseRunType,
    opts: RunTypeOptions | undefined,
    rtModule: RunTypesFunctions
): JitCompiledFunctions {
    const jitFns: JitCompiledFunctions = {
        isType: runType.createJitCompiledFunction(rtModule.JitFunctions.isType.id, undefined, opts),
        typeErrors: runType.createJitCompiledFunction(rtModule.JitFunctions.typeErrors.id, undefined, opts),
        prepareForJson: runType.createJitCompiledFunction(rtModule.JitFunctions.prepareForJson.id, undefined, opts),
        restoreFromJson: runType.createJitCompiledFunction(rtModule.JitFunctions.restoreFromJson.id, undefined, opts),
        stringifyJson: runType.createJitCompiledFunction(rtModule.JitFunctions.stringifyJson.id, undefined, opts),
        toBinary: runType.createJitCompiledFunction(rtModule.JitFunctions.toBinary.id, undefined, opts),
        fromBinary: runType.createJitCompiledFunction(rtModule.JitFunctions.fromBinary.id, undefined, opts),
    };
    return jitFns;
}

// Cache for function RunTypes to avoid duplicate reflectFunction calls
const functionRunTypeCache = new WeakMap<AnyFn, FunctionRunType>();

function getFunctionJitFns<Fn extends AnyFn>(
    fn: Fn,
    opts: RunTypeOptions | undefined,
    rtModule: RunTypesFunctions,
    isReturn: boolean
): JitCompiledFunctions {
    // Check cache first
    let runType = functionRunTypeCache.get(fn);
    if (!runType) {
        runType = rtModule.reflectFunction(fn);
        functionRunTypeCache.set(fn, runType);
    }

    const createFn = isReturn
        ? runType.createJitCompiledReturnFunction.bind(runType)
        : runType.createJitCompiledParamsFunction.bind(runType);
    const jitFunctions: JitCompiledFunctions = {
        isType: createFn(rtModule.JitFunctions.isType, opts),
        typeErrors: createFn(rtModule.JitFunctions.typeErrors, opts),
        prepareForJson: createFn(rtModule.JitFunctions.prepareForJson, opts),
        restoreFromJson: createFn(rtModule.JitFunctions.restoreFromJson, opts),
        stringifyJson: createFn(rtModule.JitFunctions.stringifyJson, opts),
        toBinary: createFn(rtModule.JitFunctions.toBinary, opts),
        fromBinary: createFn(rtModule.JitFunctions.fromBinary, opts),
    };
    return jitFunctions;
}

// ############ Null JIT Functions ############
