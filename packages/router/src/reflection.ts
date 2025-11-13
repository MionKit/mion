/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {AnyFn, JitCompiledFunctions, JitFunctionsHashes} from '@mionkit/core';
import {
    type FunctionRunType,
    type BaseRunType,
    type MemberRunType,
    type ArrayRunType,
    JitFunctions,
    RunTypeOptions,
    reflectFunction,
    isLiteralRunType,
    isArrayRunType,
    JitFnCompiler,
    getRunTypeAnnotations,
    runType,
    isTupleRunType,
} from '@mionkit/run-types';
import {Handler} from './types/handlers';
import {RouterOptions} from './types/general';
import {DEFAULT_ROUTE_OPTIONS, HEADER_HOOK_DEFAULT_PARAMS, ROUTE_DEFAULT_PARAMS} from './constants';
import {type MethodWithJitFns} from './types/remoteMethods';
import {HeadersList} from './types/context';
export {getSerializableJitCompiler} from '@mionkit/run-types';

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
    try {
        handlerRunType = reflectFunction(handler);
    } catch (error: any) {
        throw new Error(`Can not get RunType of handler for route/hook ${routeId}. Error: ${error?.message}`);
    }
    const originalParamsSlice = routerOptions.runTypeOptions?.paramsSlice;
    try {
        // paramsJitFns contains all run type functionality for the parameters, it compiles the when the property is first accessed
        const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
        runTypeOptions.paramsSlice = isHeaderHook
            ? {start: HEADER_HOOK_DEFAULT_PARAMS.length}
            : {start: ROUTE_DEFAULT_PARAMS.length};
        reflectionItems.paramNames = handlerRunType.getParameterNames(routerOptions.runTypeOptions);
        reflectionItems.paramsJitFns = getParamsJitFns(handler, runTypeOptions);
    } catch (error: any) {
        throw new Error(`Can not compile Jit Functions for Parameters of route/hook ${routeId}. Error: ${error?.message}`);
    }

    if (isHeaderHook) {
        const headersRunType = getParamsHeadersRunType(handlerRunType, routeId, routerOptions);
        const runTypeOptions = routerOptions?.runTypeOptions || DEFAULT_ROUTE_OPTIONS.runTypeOptions;
        runTypeOptions.paramsSlice = {start: HEADER_HOOK_DEFAULT_PARAMS.length - 1, end: HEADER_HOOK_DEFAULT_PARAMS.length};
        const headerNames: string[] = extractHeaderNames(headersRunType, routeId, routerOptions);

        try {
            const jitFns: JitCompiledFunctions = getJitFunctions(headersRunType, routerOptions.runTypeOptions);
            const jitHashes: JitFunctionsHashes = getJitHashes(jitFns);
            reflectionItems.headersParam = {headerNames, jitFns, jitHashes};
        } catch (error: any) {
            throw new Error(`Can not compile Jit Functions for Headers of header hook ${routeId}. Error: ${error?.message}`);
        }
    }

    const returnHeadersRunType = getReturnHeadersRunType(handlerRunType);
    if (returnHeadersRunType) {
        const headerNames: string[] = extractHeaderNames(returnHeadersRunType, routeId, routerOptions);
        const jitFns: JitCompiledFunctions = getReturnJitFns(handler, routerOptions.runTypeOptions);
        const jitHashes: JitFunctionsHashes = getJitHashes(jitFns);
        reflectionItems.headersReturn = {headerNames, jitFns, jitHashes};
    }

    try {
        // returnJitFns contains all run type functionality for the return value, it compiles the when the property is first accessed
        reflectionItems.returnJitFns = getReturnJitFns(handler);
    } catch (error: any) {
        throw new Error(`Can not get Jit Functions for Return of route/hook ${routeId}. Error: ${error?.message}`);
    }

    // Validate that routes don't use HttpHeader, HttpCookie, or HeadersList as return types
    reflectionItems.paramsJitHashes = getJitHashes(reflectionItems.paramsJitFns);
    reflectionItems.returnJitHashes = getJitHashes(reflectionItems.returnJitFns);
    reflectionItems.hasReturnData = handlerRunType.hasReturnData();
    reflectionItems.isAsync = handlerRunType.isAsync();

    if (originalParamsSlice) routerOptions.runTypeOptions.paramsSlice = originalParamsSlice;
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
        throw new Error(`Can not get RunType of handler for route/hook ${routeId}. Error: ${error?.message}`);
    }
    const reflectionItems: MethodReflect = {
        paramNames: [],
        paramsJitFns: nullJitFns,
        returnJitFns: nullJitFns,
        paramsJitHashes: nullJitHashes,
        returnJitHashes: nullJitHashes,
        hasReturnData: false,
        isAsync: handlerRunType.isAsync(),
    };
    return reflectionItems;
}

function getParamsHeadersRunType(handlerRunType: FunctionRunType, routeId: string, routerOptions: RouterOptions): ArrayRunType {
    const paramRunTypes = handlerRunType.getParameters().getParamRunTypes(getFakeCompiler(routerOptions));
    const headersArray = (paramRunTypes[1] as MemberRunType<any>)?.getMemberType?.(); // headers tuple is always index 1 after context
    if (!isHeaderListRunType(headersArray)) {
        throw new Error(`Header Hook '${routeId}' first parameter must be a tuple of HttpHeader.`);
    }
    return headersArray;
}

function getReturnHeadersRunType(handlerRunType: FunctionRunType): ArrayRunType | undefined {
    const returnRunType = handlerRunType.getReturnType();
    if (!isHeaderListRunType(returnRunType)) return undefined;
    return returnRunType;
}

function isHeaderListRunType(rt: BaseRunType | undefined): rt is ArrayRunType {
    if (!rt) return false;
    const headersListRt = runType<HeadersList<[]>>() as BaseRunType;
    return isArrayRunType(rt) && rt.getTypeName() === headersListRt.getTypeName();
}

function extractHeaderNames(headersRT: ArrayRunType, routeId: string, routerOptions: RouterOptions): string[] {
    const comp = getFakeCompiler(routerOptions);
    const annotations = getRunTypeAnnotations(headersRT);
    const headerAnnotation = annotations.find((a) => a.name === 'headerNames');
    if (!headerAnnotation)
        throw new Error(`Header Hook '${routeId}' invalid headers type, correct usage: HeadersList<['Authorization']>.`);
    const headerTuple = headerAnnotation.options;
    if (!isTupleRunType(headerTuple))
        throw new Error(`Header Hook '${routeId}' invalid headers type, correct usage: HeadersList<['Authorization']>.`);
    const headerNames = headerTuple.getJitChildren(comp).map((tupleMember) => {
        const literalRt = (tupleMember as MemberRunType<any>)?.getMemberType?.();
        if (isLiteralRunType(literalRt)) return literalRt.getLiteralValue() as string;
        throw new Error(`Header Hook '${routeId}' invalid headers type, correct usage: HeadersList<['Authorization']>.`);
    });
    return headerNames;
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
        jsonStringify: rt.createJitCompiledFunction(JitFunctions.jsonStringify.id, undefined, opts),
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
        jsonStringify: rt.createJitCompiledParamsFunction(JitFunctions.jsonStringify, opts),
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
        jsonStringify: rt.createJitCompiledReturnFunction(JitFunctions.jsonStringify, opts),
        toBinary: rt.createJitCompiledReturnFunction(JitFunctions.toBinary, opts),
        fromBinary: rt.createJitCompiledReturnFunction(JitFunctions.fromBinary, opts),
    };
    return returnFunctions;
}

function getJitHashes(jitFns: JitCompiledFunctions): JitFunctionsHashes {
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

const nullJitHashes: JitFunctionsHashes = {
    isType: '',
    typeErrors: '',
    prepareForJson: '',
    restoreFromJson: '',
    jsonStringify: '',
    toBinary: '',
    fromBinary: '',
};

// prettier-ignore
const nullJitFns: JitCompiledFunctions = {
    isType: fakeJitFn(),
    typeErrors: fakeJitFn(),
    prepareForJson: fakeJitFn(),
    restoreFromJson: fakeJitFn(),
    jsonStringify: fakeJitFn(),
    toBinary: fakeJitFn(),
    fromBinary: fakeJitFn(),
} as any;

function fakeJitFn(): (...args: any[]) => any {
    return () => {
        throw new Error('Raw hooks do not have params or return types and are not supposed to be uses as rpc methods.');
    };
}
