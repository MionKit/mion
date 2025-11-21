// ####### Executables #######

import {
    JitCompiledFunctions,
    SerializableJITFunctions,
    JitFunctionsHashes,
    HeadersMethodData,
    SerializablePublicMethod,
} from '@mionkit/core'; // do not import type only
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import {RpcError} from '@mionkit/core';
import {PublicResponses} from './publicMethods';

export interface MethodOptions {
    runOnError?: boolean;
    validateParams?: boolean;
    validateReturn?: boolean;
    description?: string;
}

export interface MethodData extends Omit<SerializablePublicMethod, 'hookIds' | 'pathPointers'> {
    type: number;
    id: string;
    paramNames: string[];
    paramsJitHashes: JitFunctionsHashes;
    returnJitHashes: JitFunctionsHashes;
    headersParam?: HeadersMethodData;
    headersReturn?: HeadersMethodData;
    // non required by SerializablePublicMethod
    pointer: string[];
    nestLevel: number;
    options: MethodOptions;
    isAsync: boolean;
    hasReturnData: boolean;
}

export interface MethodWithJitFns extends MethodData {
    paramsJitFns: JitCompiledFunctions;
    returnJitFns: JitCompiledFunctions;
    headersParam?: HeadersMethodWithJitFns;
    headersReturn?: HeadersMethodWithJitFns;
}

export interface HeadersMethodWithJitFns extends HeadersMethodData {
    jitFns: Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

/** Record of all persisted methods */
export type MethodsCache = Record<string, MethodData>;

export enum HandlerType {
    route = 1,
    hook = 2,
    headerHook = 3,
    rawHook = 4,
}

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Method<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
    handler: H;
    methodCaller?: (...args: any[]) => any;
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
    headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawHookHandler = any> extends Method<H> {
    type: HandlerType.rawHook;
    options: MethodOptions & {
        validateParams: false;
        validateReturn?: false;
    };
}

export interface NotFoundMethod extends Method {
    is404: true;
}

export type CompiledMethod = Omit<Method, 'handler' | 'methodCaller'> & {
    paramsJitFns: SerializableJITFunctions;
    returnJitFns: SerializableJITFunctions;
};

export type RouteOptions = Partial<Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn'>>;
export type HookOptions = Partial<
    Pick<HookMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>
>;
export type HeaderHookOptions = Partial<
    Pick<HeaderMethod['options'], 'description' | 'validateParams' | 'runOnError' | 'validateReturn'>
>;
export type RawHookOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionList {
    routeIndex: number;
    methods: Method[];
    bodyStringify?: (respBody: PublicResponses) => {body: string; stringifyErrors: Record<string, RpcError<string>>};
}
