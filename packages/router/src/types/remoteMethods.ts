// ####### Executables #######

import type {HeadersMethodWithJitFns, MethodWithJitFns, SerializerMode, DeserializerMode} from '@mionkit/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers'; // do not import type only
import {HandlerType} from '@mionkit/core'; // do not import type only

export interface RemoteMethodOpts {
    runOnError?: boolean;
    validateParams?: boolean;
    validateReturn?: boolean;
    description?: string;
    /**
     * Override serializer mode for this specific route/hook.
     * If not specified, uses router default serialize mode.
     */
    serialize?: SerializerMode;
    /**
     * Override deserializer mode for this specific route/hook.
     * If not specified, uses router default deserialize mode.
     */
    deserialize?: DeserializerMode;
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

export type RouteOptions = Partial<
    Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'serialize' | 'deserialize'>
>;
export type HookOptions = Partial<
    Pick<HookMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'serialize' | 'deserialize'>
>;
export type HeaderHookOptions = Partial<
    Pick<
        HeaderMethod['options'],
        'description' | 'validateParams' | 'validateReturn' | 'runOnError' | 'serialize' | 'deserialize'
    >
>;
// RawHookOptions doesn't need encoding - raw hooks handle their own serialization
export type RawHookOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionList {
    routeIndex: number;
    methods: RemoteMethod[];
}
