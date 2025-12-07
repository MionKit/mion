// ####### Executables #######

import type {Prettify, MethodOptions} from '@mionkit/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import type {HandlerType} from '@mionkit/core';
import {HeadersMethodWithJitFns, MethodWithJitFns} from '@mionkit/core/src/method.types';

/** Contains the handlers for hooks and routes */
export interface RemoteMethod<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
    handler: H;
    methodCaller?: (...args: any[]) => any;
}

export interface RouteMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: HandlerType.route;
    options: MethodOptions & {runOnError: false};
}
export interface HookMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: HandlerType.hook;
}
export interface HeaderMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
    type: HandlerType.headerHook;
    headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawHookHandler = any> extends RemoteMethod<H> {
    type: HandlerType.rawHook;
    options: MethodOptions & {
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
