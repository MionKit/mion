/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FunctionReflection, ReflectionOptions, SerializedTypes} from '@mionkit/runtype';
import type {Context, CoreOptions, RawServerCallContext} from '@mionkit/core';
import type {Handler, HookDef, SimpleHandler, BodyParserOptions, InternalHookHandler, InternalHookDef} from '@mionkit/hooks';

// #######  Routes #######

/** Route definition */
export type RouteDef<App = any, CallContext extends Context<any, any> = any, Ret = any> = {
    /** overrides route's path and fieldName in request/response body */
    path?: string;
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
    /** Route Handler */
    route: Handler<App, CallContext, Ret>;
};

/**
 * Function to be run before and after every single executable.
 * Can be used for things like param validation, serialization.
 * Be careful with performance as this function is run for every single executable.
 */
export type ExecutableMicroTask<CallContext extends Context<any, any> = any> = (
    /** Static Data: main App, db driver, libraries, etc... */
    step: number,
    /** The */
    executable: Executable,
    /** Call Context */
    context: CallContext
) => void;

/** A route can be a full route definition or just the handler */
export type Route<App = any, CallContext extends Context<any, any> = any, Ret = any> =
    | RouteDef<App, CallContext, Ret>
    | Handler<App, CallContext, Ret>;

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export type Routes<App = any, CallContext extends Context<any, any> = any> = {
    [key: string]: HookDef<App, CallContext> | Route<App, CallContext> | Routes<App, CallContext>;
};

// ####### Router Options #######

export type SerializationOptions = {
    /** enable automatic parameter validation, defaults to true */
    enableValidation: boolean;
    /** Enables serialization/deserialization */
    enableSerialization: boolean;
};

/** Global Router Options */
export type RouterOptions<RawContext extends RawServerCallContext = RawServerCallContext> = {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** Transform the path before finding a route */
    pathTransform?: (request: RawContext['rawRequest'], path: string) => string;
    /** configures the fieldName in the request/response body used for a route's params/response */
    routeFieldName?: string;
    /** Used to return public data when adding routes */
    getPublicRoutesData: boolean;
    /** lazy load function reflection, should improve cold start performance */
    lazyLoadReflection: boolean;
};

export type FullRouterOptions<RawContext extends RawServerCallContext = RawServerCallContext> =
    RouterOptions<RawServerCallContext> & CoreOptions & SerializationOptions & BodyParserOptions & ReflectionOptions;

// ####### Execution Path #######

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export type Executable = {
    nestLevel: number;
    path: string;
    forceRunOnError: boolean;
    canReturnData: boolean;
    inHeader: boolean;
    fieldName: string;
    isRoute: boolean;
    isInternal: boolean;
    handler: Handler | SimpleHandler | InternalHookHandler;
    reflection: FunctionReflection;
    src: RouteDef | HookDef | InternalHookDef;
    enableValidation: boolean;
    enableSerialization: boolean;
    selfPointer: string[];
};

export type RouteExecutable<H extends Handler | SimpleHandler> = Executable & {
    isRoute: true;
    canReturnData: true;
    forceRunOnError: false;
    isInternal: false;
    handler: H;
};

export type HookExecutable<H extends Handler | SimpleHandler> = Executable & {
    isRoute: false;
    isInternal: false;
    handler: H;
};

export type InternalHookExecutable = Executable & {
    isRoute: false;
    isInternal: true;
    handler: InternalHookHandler;
};

// ####### Public Facing Types #######

//TODO: some hooks could have no public params and not return any data so they should not be in the public spec
/** Data structure containing all public data an types of the routes. */
export type PublicMethods<Type extends Routes> = {
    [Property in keyof Type]: Type[Property] extends HookDef
        ? PublicHook<Type[Property]['hook']>
        : Type[Property] extends RouteDef
        ? PublicRoute<Type[Property]['route']>
        : Type[Property] extends Handler
        ? PublicRoute<Type[Property]>
        : Type[Property] extends Routes
        ? PublicMethods<Type[Property]>
        : never;
};

// prettier-ignore
export type PublicHandler<H extends Handler | SimpleHandler> = 
    H extends (app: any, ctx: Context<any, any>, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    :  H extends (...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<Awaited<Resp>>
    : never;

export type PublicRoute<H extends Handler> = {
    /** Type reference to the route handler, its value is actually null or void function ans should never be called. */
    _handler: PublicHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: true;
    canReturnData: true;
    path: string;
    inHeader: boolean;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
    publicExecutionPathPointers?: string[][];
};

export type PublicHook<H extends Handler> = {
    /** Type reference to the route handler, its value is actually null or void function ans should never be called. */
    _handler: PublicHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: false;
    canReturnData: boolean;
    inHeader: boolean;
    fieldName: string;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
};

export type PublicMethod<H extends Handler = any> = PublicRoute<H> | PublicHook<H>;

// #######  type guards #######

/** Type guard: isHandler */
export function isHandler(entry: HookDef | Route | Routes): entry is Handler {
    return typeof entry === 'function';
}
/** Type guard: isRouteDef */
export function isRouteDef(entry: HookDef | Route | Routes): entry is RouteDef {
    return typeof (entry as RouteDef).route === 'function';
}
/** Type guard: isHook */
export function isHookDef(entry: HookDef | Route | Routes): entry is HookDef {
    return typeof (entry as HookDef).hook === 'function';
}
/** Type guard: isRoute */
export function isRoute(entry: HookDef | Route | Routes): entry is Route {
    return typeof entry === 'function' || typeof (entry as RouteDef).route === 'function';
}
/** Type guard: isRoutes */
export function isRoutes(entry: any): entry is Route {
    return typeof entry === 'object';
}
/** Type guard: isExecutable */
export function isExecutable(entry: Executable | {pathPointer: string[]}): entry is Executable {
    return (
        typeof (entry as Executable)?.path === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
}
/** Type guard: isInternalHook */
export function isInternalHook(entry: HookDef | InternalHookDef): entry is InternalHookDef {
    return typeof (entry as InternalHookDef).internalHook === 'function';
}

export function isPublicExecutable(entry: Executable): entry is Executable {
    return entry.canReturnData || !!entry.reflection.paramsLength;
}

export function isPublicMethod(entry: PublicRoute<any> | PublicHook<any>): entry is PublicMethod<any> {
    return entry.canReturnData || !!entry.params.length;
}
