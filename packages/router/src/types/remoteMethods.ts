// ####### Executables #######

import {JitCompiledFunctions, SerializableJITFunctions, JitFunctionsHashes} from '@mionkit/core'; // do not import type only
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import {RpcError} from '@mionkit/core';
import {PublicResponses} from './publicMethods';

export interface MethodOptions {
    runOnError?: boolean;
    validateParams?: boolean;
    deserializeParams?: boolean;
    validateReturn?: boolean;
    serializeReturn?: boolean;
    description?: string;
}

export interface MethodBase {
    type: number;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    options: MethodOptions;
}

export interface HeadersMethodData {
    headerNames: string[];
    jitHashes: Pick<JitFunctionsHashes, 'isType' | 'typeErrors'>;
}

export interface HeadersMethodReflection extends HeadersMethodData {
    jitFns: Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

export interface MethodData extends MethodBase {
    paramNames: string[];
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
    headersParam?: HeadersMethodData;
    headersReturn?: HeadersMethodData;
}

export interface MethodReflection extends MethodData {
    isAsync: boolean;
    hasReturnData: boolean;
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
    headersParam?: HeadersMethodReflection;
    headersReturn?: HeadersMethodReflection;
}

export type RawMethodData = MethodBase;

/** Record of all persisted methods */
export type MethodsCache = Record<string, MethodData>;

export enum HandlerType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
}

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Method<H extends AnyHandler = AnyHandler> extends MethodReflection {
    handler: H;
    methodCaller?: (...args: any[]) => void;
}

export interface RouteMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.route;
    options: MethodOptions & {runOnError: false};
}
export interface HookMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.hook;
}
export interface HeaderMethod<H extends HeaderHandler = any> extends Method<H> {
    type: HandlerType.headerHook;
    headersParam: HeadersMethodReflection;
}
export interface RawMethod<H extends RawHookHandler = any> extends Method<H> {
    type: HandlerType.rawHook;
    options: MethodOptions & {
        validateParams: false;
        deserializeParams: false;
        validateReturn?: false;
        serializeReturn?: false;
    };
}

export interface NotFoundMethod extends Method {
    is404: true;
}

export type CompiledMethod = Omit<Method, 'handler' | 'methodCaller'> & {
    paramsJitFns: SerializableJITFunctions;
    returnJitFns: SerializableJITFunctions;
};

export type RouteOptions = Partial<
    Pick<RouteMethod['options'], 'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn'>
>;
export type HookOptions = Partial<
    Pick<
        HookMethod['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn' | 'runOnError'
    >
>;
export type HeaderHookOptions = Partial<
    Pick<
        HeaderMethod['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'runOnError' | 'validateReturn' | 'serializeReturn'
    >
>;
export type RawHookOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionList {
    routeIndex: number;
    methods: Method[];
    bodyStringify?: (respBody: PublicResponses) => {body: string; stringifyErrors: Record<string, RpcError<any>>};
}
