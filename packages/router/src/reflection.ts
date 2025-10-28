/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyFn, JitCompiledFunctions, JitFunctionsHashes, SerializableJITFunctions} from '@mionkit/core';
import {
    JitFunctions,
    RunTypeOptions,
    reflectFunction,
    getSerializableJitCompiler,
    type FunctionRunType,
    type SrcType,
} from '@mionkit/run-types';
import {ReflectionKind} from '@deepkit/type';
import {Handler} from './types/handlers';
import {RouterOptions} from './types/general';
import {HeaderOptions, CookieOptions} from './types/http-params';
import {DEFAULT_ROUTE_OPTIONS} from './constants';

export function getParamsJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JitCompiledFunctions {
    const rt = reflectFunction(fn);
    const paramFunctions: JitCompiledFunctions = {
        isType: rt.createJitCompiledParamsFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledParamsFunction(JitFunctions.typeErrors, opts),
        prepareForJson: rt.createJitCompiledParamsFunction(JitFunctions.prepareForJson, opts),
        restoreFromJson: rt.createJitCompiledParamsFunction(JitFunctions.restoreFromJson, opts),
        jsonStringify: rt.createJitCompiledParamsFunction(JitFunctions.jsonStringify, opts),
        toBinary: rt.createJitCompiledParamsFunction(JitFunctions.toBinary, opts),
        fromBinary: rt.createJitCompiledParamsFunction(JitFunctions.fromBinary, opts),
    };
    return paramFunctions;
}

export function getReturnJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JitCompiledFunctions {
    const rt = reflectFunction(fn);

    const returnFunctions: JitCompiledFunctions = {
        isType: rt.createJitCompiledReturnFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledReturnFunction(JitFunctions.typeErrors, opts),
        prepareForJson: rt.createJitCompiledReturnFunction(JitFunctions.prepareForJson, opts),
        restoreFromJson: rt.createJitCompiledReturnFunction(JitFunctions.restoreFromJson, opts),
        jsonStringify: rt.createJitCompiledReturnFunction(JitFunctions.jsonStringify, opts),
        toBinary: rt.createJitCompiledReturnFunction(JitFunctions.toBinary, opts),
        fromBinary: rt.createJitCompiledReturnFunction(JitFunctions.fromBinary, opts),
    };
    return returnFunctions;
}

export function getSerializableJitFunctions(jitCompFns: JitCompiledFunctions): SerializableJITFunctions {
    return {
        isType: getSerializableJitCompiler(jitCompFns.isType),
        typeErrors: getSerializableJitCompiler(jitCompFns.typeErrors),
        prepareForJson: getSerializableJitCompiler(jitCompFns.prepareForJson),
        restoreFromJson: getSerializableJitCompiler(jitCompFns.restoreFromJson),
        jsonStringify: getSerializableJitCompiler(jitCompFns.jsonStringify),
        toBinary: getSerializableJitCompiler(jitCompFns.toBinary),
        fromBinary: getSerializableJitCompiler(jitCompFns.fromBinary),
    };
}

export interface ParamInfo {
    name: string;
    header?: {
        name: string;
        options?: HeaderOptions;
    };
    cookie?: {
        name: string;
        options?: CookieOptions;
    };
    isBodyParam?: boolean;
}

interface MethodReflectionItems {
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
    handlerRunType: FunctionRunType;
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    params: ParamInfo[];
    paramNames: string[];
}

export function getJitHashes(jitFns: JitCompiledFunctions): JitFunctionsHashes {
    return {
        isType: jitFns.isType.jitFnHash,
        typeErrors: jitFns.typeErrors.jitFnHash,
        prepareForJson: jitFns.prepareForJson.jitFnHash,
        restoreFromJson: jitFns.restoreFromJson.jitFnHash,
        jsonStringify: jitFns.jsonStringify.jitFnHash,
        toBinary: jitFns.toBinary.jitFnHash,
        fromBinary: jitFns.fromBinary.jitFnHash,
    };
}

function extractParamInfo(handlerRunType: FunctionRunType, routerOptions?: RouterOptions): ParamInfo[] {
    const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
    // Create a mock compiler object with just the opts property needed by getParamRunTypes.
    // getParamRunTypes() requires a JitFnCompiler but we only need the opts property to slice parameters.
    // This is a workaround to avoid creating a full compiler instance. If getParamRunTypes() signature
    // changes to accept RunTypeOptions directly, this can be simplified.
    const mockCompiler = {opts: runTypeOptions} as any;
    const paramRunTypes = handlerRunType.getParameters().getParamRunTypes(mockCompiler);
    const paramNames = handlerRunType.getParameterNames(runTypeOptions);

    return paramRunTypes.map((paramRT: any, index: number) => {
        const paramInfo: ParamInfo = {
            name: paramNames[index],
            isBodyParam: true, // default
        };

        // Check if parameter is HttpHeader<Name, Value>
        // The paramRT.src is the actual type, we need to check if it's a class type
        const src = paramRT.src as any;
        if (src.kind === ReflectionKind.class && src.classType?.name === 'HttpHeader') {
            const typeArgs = src.typeArguments;
            if (typeArgs && typeArgs.length > 0) {
                const headerName = extractLiteralValue(typeArgs[0]);
                paramInfo.header = {
                    name: headerName,
                    options: extractHeaderOptions(),
                };
                paramInfo.isBodyParam = false;
            }
        }

        // Check if parameter is Cookie<Name>
        if (src.kind === ReflectionKind.class && src.classType?.name === 'Cookie') {
            const typeArgs = src.typeArguments;
            if (typeArgs && typeArgs.length > 0) {
                const cookieName = extractLiteralValue(typeArgs[0]);
                paramInfo.cookie = {
                    name: cookieName,
                    options: extractCookieOptions(),
                };
                paramInfo.isBodyParam = false;
            }
        }

        // Check if parameter is BodyParam<T>
        if (src.kind === ReflectionKind.class && src.classType?.name === 'BodyParam') {
            // BodyParam is explicitly a body parameter
            paramInfo.isBodyParam = true;
        }

        return paramInfo;
    });
}

function extractLiteralValue(type: SrcType | undefined): string {
    if (!type) return '';
    if (type.kind === ReflectionKind.literal) {
        return type.literal as string;
    }
    return '';
}

function extractHeaderOptions(): HeaderOptions | undefined {
    // For now, we don't extract header options from type arguments
    // This can be extended in the future if needed
    return undefined;
}

function extractCookieOptions(): CookieOptions | undefined {
    // For now, we don't extract cookie options from type arguments
    // This can be extended in the future if needed
    return undefined;
}

// TODO: we do not want to use runtypes directly but compiled functions so we can take advantage
// of precompiled functions without having to generate JIT functions
// this way we also do not need to use new Function which is not allowed in some environments
export function getHandlerReflection(handler: Handler, routeId: string, routerOptions: RouterOptions): MethodReflectionItems {
    const reflectionItems: Partial<MethodReflectionItems> = {};
    let handlerRunType: FunctionRunType;
    try {
        handlerRunType = reflectFunction(handler);
        reflectionItems.handlerRunType = handlerRunType;
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/hook ${routeId}. Error: ${error?.message}`);
    }

    try {
        // paramsJitFns contains all run type functionality for the parameters, it compiles the when the property is first accessed
        const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
        reflectionItems.paramsJitFns = getParamsJitFns(handler, runTypeOptions);
        // Extract parameter info to detect HttpHeader, Cookie, and BodyParam types
        // Note: extractParamInfo uses a mock compiler object to call getParamRunTypes() with the runTypeOptions
        // If getParamRunTypes() signature changes in the future, this may need to be updated
        reflectionItems.params = extractParamInfo(handlerRunType, routerOptions);
        reflectionItems.paramNames = reflectionItems.params.map((p) => p.name);
    } catch (error: any) {
        throw new Error(`Can not compile Jit Functions for Parameters of route/hook ${routeId}. Error: ${error?.message}`);
    }

    try {
        // returnJitFns contains all run type functionality for the return value, it compiles the when the property is first accessed
        reflectionItems.returnJitFns = getReturnJitFns(handler);
    } catch (error: any) {
        console.error(error);
        throw new Error(`Can not get Jit Functions for Return of route/hook ${routeId}. Error: ${error?.message}`);
    }
    reflectionItems.paramsJitHashes = getJitHashes(reflectionItems.paramsJitFns);
    reflectionItems.returnJitHashes = getJitHashes(reflectionItems.returnJitFns);
    return reflectionItems as MethodReflectionItems;
}
