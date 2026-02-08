// ####### Executables #######

import type {HeadersMethodWithJitFns, MethodWithJitFns, RemoteMethodOpts, RouteOnlyOptions, SerializerCode} from '@mionkit/core'; // do not import type only
import type {AnyHandler, Handler, HeaderHandler, RawLinkedFnHandler} from './handlers'; // do not import type only
import {HandlerType} from '@mionkit/core'; // do not import type only

/** Contains the handlers for linkedFns and routes */
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
export interface LinkedFnMethod<H extends Handler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.linkedFn;
}
export interface HeadersMethod<H extends HeaderHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.headersLinkedFn;
    headersParam: HeadersMethodWithJitFns;
}
export interface RawMethod<H extends RawLinkedFnHandler = any> extends RemoteMethod<H> {
    type: typeof HandlerType.rawLinkedFn;
    options: RemoteMethodOpts & {
        validateParams: false;
        validateReturn?: false;
    };
}

export type RouteOptions = Partial<
    Pick<RouteMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'serializer'>
>;
export type LinkedFnOptions = Partial<
    Pick<LinkedFnMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>
>;
export type HeadersLinkedFnOptions = Partial<
    Pick<HeadersMethod['options'], 'description' | 'validateParams' | 'validateReturn' | 'runOnError'>
>;
// RawLinkedFnOptions doesn't need encoding - raw linkedFns handle their own serialization
export type RawLinkedFnOptions = Partial<Pick<RawMethod['options'], 'description' | 'runOnError'>>;

export interface MethodsExecutionChain {
    routeIndex: number;
    methods: RemoteMethod[];
    /** Precalculated serializer code for the route's response body type */
    serializer: SerializerCode;
}
