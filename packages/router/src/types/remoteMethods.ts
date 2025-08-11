// ####### Executables #######

import {JitCompiledFunctions, JitFunctionsHashes, SerializableJITFunctions} from '@mionkit/core'; // do not import type only
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import type {RpcError} from '@mionkit/core';
import {PublicResponses} from './publicMethods';

export enum HandlerType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
}

export interface MethodOptions {
    runOnError?: boolean;
    hasReturnData?: boolean;
    validateParams?: boolean;
    deserializeParams?: boolean;
    validateReturn?: boolean;
    serializeReturn?: boolean;
    description?: string;
    isAsync?: boolean;
}

export interface MethodData {
    type: HandlerType;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    paramNames?: string[];
    headerNames?: string[];
    options: MethodOptions;
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
}

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Method<H extends AnyHandler = AnyHandler> extends MethodData {
    paramsJitFns?: JitCompiledFunctions;
    returnJitFns?: JitCompiledFunctions;
    handler: H;
    methodCaller?: (...args: any[]) => void;
}

export interface NonRawMethod<H extends Handler = Handler> extends Method<H> {
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
}
export interface RouteMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.route;
    handler: H;
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
    options: MethodOptions & {runOnError: false};
}
export interface HookMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.hook;
    handler: H;
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
}
export interface HeaderMethod<H extends HeaderHandler = any> extends Method<H> {
    type: HandlerType.headerHook;
    handler: H;
    headerNames: string[];
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    paramNames: string[];
}
export interface RawMethod<H extends RawHookHandler = any> extends Method<H> {
    type: HandlerType.rawHook;
    handler: H;
    paramsJitFns: undefined;
    returnJitFns: undefined;
    paramNames: undefined;
    options: MethodOptions & {
        hasReturnData: false;
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
    Pick<
        RouteMethod['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn' | 'isAsync'
    >
>;
export type HookOptions = Partial<
    Pick<
        HookMethod['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'validateReturn' | 'serializeReturn' | 'runOnError' | 'isAsync'
    >
>;
export type HeaderHookOptions = Partial<
    Pick<
        HeaderMethod['options'],
        'description' | 'validateParams' | 'deserializeParams' | 'runOnError' | 'validateReturn' | 'serializeReturn' | 'isAsync'
    >
>;
export type RawHookOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError' | 'isAsync'>>;

export interface MethodsExecutionList {
    routeIndex: number;
    methods: Method[];
    bodyStringify?: (respBody: PublicResponses) => {body: string; stringifyErrors: Record<string, RpcError>};
}
