// ####### Executables #######

import type {HeadersMethodWithJitFns, MethodWithJitFns, RemoteMethodOpts, RouteOnlyOptions, SerializerCode} from '@mionjs/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawMiddleFnHandler} from './handlers.ts'; // do not import type only
import {HandlerType} from '@mionjs/core'; // do not import type only

/** Contains the handlers for middleFns and routes */
export interface RemoteMethod<H extends AnyHandler = AnyHandler> extends MethodWithJitFns {
    /** router options */
    options: RemoteMethodOpts;
    handler: H;
    methodCaller?: (...args: any[]) => any;
}

export interface RouteMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.route;
    options: RouteOnlyOptions;
}
export interface MiddleFnMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.middleFn;
}
export interface HeadersMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.headersMiddleFn;
    headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawMiddleFnHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.rawMiddleFn;
    options: RemoteMethodOpts & {
        validateParams: false;
        validateReturn?: false;
    };
}

export type RouteOptions = Partial<
    Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'serializer'>
>;
export type MiddleFnOptions = Partial<
    Pick<MiddleFnMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>
>;
export type HeadersMiddleFnOptions = Partial<
    Pick<HeadersMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>
>;
// RawMiddleFnOptions doesn't need encoding - raw middleFns handle their own serialization
export type RawMiddleFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionChain {
    routeIndex: number;
    methods: RemoteMethod[];
    /** Precalculated serializer code for the route's response body type */
    serializer: SerializerCode;
}
