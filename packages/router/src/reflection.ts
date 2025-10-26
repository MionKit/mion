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
} from '@mionkit/run-types';
import {Handler} from './types/handlers';
import {RouterOptions} from './types/general';

export function getParamsJitFns<Fn extends AnyFn>(fn: Fn, opts?: RunTypeOptions): JitCompiledFunctions {
    const rt = reflectFunction(fn);
    const paramFunctions: JitCompiledFunctions = {
        isType: rt.createJitCompiledParamsFunction(JitFunctions.isType, opts),
        typeErrors: rt.createJitCompiledParamsFunction(JitFunctions.typeErrors, opts),
        prepareForJson: rt.createJitCompiledParamsFunction(JitFunctions.prepareForJson, opts),
        restoreFromJson: rt.createJitCompiledParamsFunction(JitFunctions.restoreFromJson, opts),
        jsonStringify: rt.createJitCompiledParamsFunction(JitFunctions.jsonStringify, opts),
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
    };
}

interface MethodReflectionItems {
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
    handlerRunType: FunctionRunType;
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
}

export function getJitHashes(jitFns: JitCompiledFunctions): JitFunctionsHashes {
    return {
        isType: jitFns.isType.jitFnHash,
        typeErrors: jitFns.typeErrors.jitFnHash,
        prepareForJson: jitFns.prepareForJson.jitFnHash,
        restoreFromJson: jitFns.restoreFromJson.jitFnHash,
        jsonStringify: jitFns.jsonStringify.jitFnHash,
    };
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
        reflectionItems.paramsJitFns = getParamsJitFns(handler, routerOptions.runTypeOptions);
        reflectionItems.paramNames = handlerRunType.getParameterNames(routerOptions.runTypeOptions);
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
