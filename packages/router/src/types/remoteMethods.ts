// ####### Executables #######

import type {Prettify, HeadersMethodWithJitFns, MethodWithJitFns} from '@mionkit/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import {HandlerType} from '@mionkit/core'; // do not import type only

export interface RemoteMethodOpts {
    runOnError?: boolean;
    validateParams?: boolean;
    validateReturn?: boolean;
    description?: string;
}

/** Contains the handlers for hooks and routes */
export interface RemoteMethod<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
    /** router options */
    options: RemoteMethodOpts;
    handler: H;
    methodCaller?: (...args: any[]) => any;
}

export interface RouteMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.route;
    options: RemoteMethodOpts & {runOnError: false};
}
export interface HookMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.hook;
}
export interface HeaderMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.headerHook;
    headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawHookHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.rawHook;
    options: RemoteMethodOpts & {
        validateParams: false;
        validateReturn?: false;
    };
}

export interface NotFoundMethod extends RemoteMethod {
    is404: true;
}

export type RouteOptions = Prettify<Partial<Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn'>>>;
export type HookOptions = Prettify<
    Partial<Pick<HookMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>>
>;
export type HeaderHookOptions = Prettify<
    Partial<Pick<HeaderMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>>
>;
export type RawHookOptions = Prettify<Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>>;

export interface MethodsExecutionList {
    routeIndex: number;
    methods: RemoteMethod[];
    isNotFound?: true;
}
