// ####### Executables #######

import {JITCompiledFunctions, SerializableJITFunctions} from '@mionkit/core/src/types'; // do not import type only
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only

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

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export interface Method<H extends AnyHandler = AnyHandler> {
    type: HandlerType;
    id: string;
    // pointer to the src Hook or Route definition within the original Routers object, ie: ['users','getUser']
    pointer: string[];
    nestLevel: number;
    handler: H;
    paramsJitFns?: JITCompiledFunctions;
    returnJitFns?: JITCompiledFunctions;
    paramNames?: string[];
    headerNames?: string[];
    options: MethodOptions;
    methodCaller?: (...args: any[]) => void;
}

export interface NonRawMethod<H extends Handler = Handler> extends Method<H> {
    paramsJitFns: JITCompiledFunctions;
    returnJitFns: JITCompiledFunctions;
    paramNames: string[];
}
export interface RouteMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.route;
    handler: H;
    paramsJitFns: JITCompiledFunctions;
    returnJitFns: JITCompiledFunctions;
    paramNames: string[];
    options: MethodOptions & {runOnError: false};
}
export interface HookMethod<H extends Handler = any> extends Method<H> {
    type: HandlerType.hook;
    handler: H;
    paramsJitFns: JITCompiledFunctions;
    returnJitFns: JITCompiledFunctions;
    paramNames: string[];
}
export interface HeaderMethod<H extends HeaderHandler = any> extends Method<H> {
    type: HandlerType.headerHook;
    handler: H;
    headerNames: string[];
    paramsJitFns: JITCompiledFunctions;
    returnJitFns: JITCompiledFunctions;
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
    bodyStringify?: (body: any) => string;
}
