/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionOptions, FunctionReflection, SerializedTypes} from '@mionkit/runtype';
import {CoreOptions, Obj, PublicError, RouteError} from '@mionkit/core';

// #######  Route Handlers #######

/** Route or Hook Handler  */
export type Handler<Context extends CallContext = CallContext, Ret = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: any
) => Ret | Promise<Ret>;

/** Header Hook Handler, hook handler for when params are sent in the header  */
export type HeaderHandler<Context extends CallContext = CallContext, Ret = any, HValue extends ParsedHeader = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    headerValue: HValue
) => Ret | Promise<Ret>;

/** Handler to use with raw hooks to get access to raw request and response */
export type RawHookHandler<
    Context extends CallContext = CallContext,
    RawReq extends RawRequest = RawRequest,
    RawResp = unknown,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>
> = (ctx: Context, request: RawReq, response: RawResp, opts: Opts) => ErrorReturn;

export type AnyHandler = (...parameters: any) => any | Promise<any>;

// #######  Routes Definitions #######

/** Route definition */
export interface RouteDef<Context extends CallContext = CallContext, Ret = any> {
    /** overrides route's path and fieldName in request/response body */
    path?: string;
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** Overrides global enableValidation */
    enableValidation?: boolean;
    /** Overrides global enableSerialization */
    enableSerialization?: boolean;
    /** Overrides global useAsyncCallContext */
    useAsyncCallContext?: boolean;
    /** Route Handler */
    route: Handler<Context, Ret>;
}

interface HookBase {
    /** Executes the hook even if an error was thrown previously */
    forceRunOnError?: boolean;
    /** Enables returning data in the responseBody,
     * hooks must explicitly enable returning data */
    canReturnData?: boolean;
    /** Description of the route, mostly for documentation purposes */
    description?: string;
    /** Overrides global enableValidation */
    enableValidation?: boolean;
    /** Overrides global enableSerialization */
    enableSerialization?: boolean;
    /** Overrides global useAsyncCallContext */
    useAsyncCallContext?: boolean;
}

/** Hook definition, a function that hooks into the execution path */
export interface HookDef<Context extends CallContext = CallContext, Ret = any> extends HookBase {
    /** The fieldName in the request/response body */
    fieldName?: string;
    /** Hook handler */
    hook: Handler<Context, Ret>;
}

/** Header Hook definition, used to handle header params */
export interface HeaderHookDef<Context extends CallContext = CallContext, Ret = any> extends HookBase {
    /** the name of the header in the request/response */
    headerName?: string;
    headerHook: HeaderHandler<Context, Ret>;
}

/**
 * Raw hook, used only to access raw request/response and modify the call context.
 * Can not declare extra parameters.
 */
export interface RawHookDef<
    Context extends CallContext = CallContext,
    RawReq extends RawRequest = RawRequest,
    RawResp = any,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>
> {
    rawHook: RawHookHandler<Context, RawReq, RawResp, Opts>;
}

// #######  Router Object #######

/** A route can be a full route definition or just the handler */
export type Route<Context extends CallContext = CallContext, Ret = any> = RouteDef<Context, Ret> | Handler<Context, Ret>;

/** A route entry can be a route, a hook or sub-routes */
export type RouterEntry = HookDef | Route | Routes | RawHookDef | HeaderHookDef;

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export interface Routes {
    [key: string]: RouterEntry;
}

// ####### Router Options #######

/** Global Router Options */
export interface RouterOptions<Req extends RawRequest = any, SharedData = any> extends CoreOptions {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** Transform the path before finding a route */
    pathTransform?: (request: Req, path: string) => string;
    /** factory function to initialize shared call context data */
    sharedDataFactory?: SharedDataFactory<SharedData>;
    /** configures the fieldName in the request/response body used for a route's params/response */
    routeFieldName?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation: boolean;
    /** Enables serialization/deserialization */
    enableSerialization: boolean;
    /** Reflection and Deepkit Serialization-Validation options */
    reflectionOptions: ReflectionOptions;
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: JsonParser;
    /** Used to return public data when adding routes */
    getPublicRoutesData: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
}

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
    isRawExecutable: boolean;
    handler: AnyHandler;
    reflection: FunctionReflection | null;
    // src: RouteDef | HookDef | RawHookDef;
    enableValidation: boolean;
    enableSerialization: boolean;
    selfPointer: string[];
};

export interface RouteExecutable extends Executable {
    isRoute: true;
    isRawExecutable: false;
    canReturnData: true;
    forceRunOnError: false;
    handler: Handler;
    reflection: FunctionReflection;
}

export interface HookExecutable extends Executable {
    isRoute: false;
    isRawExecutable: false;
    handler: Handler | HeaderHandler;
    reflection: FunctionReflection;
}

export interface RawExecutable extends Executable {
    isRoute: false;
    isRawExecutable: true;
    handler: RawHookHandler;
    reflection: null;
}

export interface NotFoundExecutable extends Executable {
    is404: true;
}

// ####### Call Context #######

/** The call Context object passed as first parameter to any hook or route */
export type CallContext<SharedData = any> = {
    /** Route's path after internal transformation*/
    readonly path: string;
    /** Router's own request object */
    readonly request: Request;
    /** Router's own response object */
    readonly response: Response;
    /** shared data between handlers (route/hooks) and that is not returned in the response. */
    shared: SharedData;
};

// ####### REQUEST & RESPONSE #######

// TODO: Study Using a Common Interface getting setting headers and body
// this way router can use that interface for reading and writing headers and body instead to the context therefore saving memory and cpu

/** Router's own request object, do not confuse with the underlying raw request */
export type Request = {
    /** parsed headers */
    readonly headers: Readonly<Obj>;
    /** parsed body */
    readonly body: Readonly<Obj>;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    readonly internalErrors: Readonly<RouteError[]>;
};

/** Any request used by the router must follow this interface */
export type RawRequest = {
    headers: {[header: string]: string | undefined | string[]} | undefined;
    body: string | null | undefined | {}; // eslint-disable-line @typescript-eslint/ban-types
};

/** Router's own response object, do not confuse with the underlying raw response */
export type Response = {
    readonly statusCode: number;
    /** response errors: empty if there were no errors during execution */
    readonly hasErrors: boolean;
    /** response headers */
    readonly headers: Headers;
    /** the router response data, body should not be modified manually so marked as Read Only */
    readonly body: Readonly<PublicResponses>;
    /** json encoded response, contains data and errors if there are any. */
    readonly json: string;
};

export type ParsedHeader = string | number | boolean | (string | number | boolean)[];
export type RawHeader = string | number | boolean | undefined | null | (string | number | boolean | undefined | null)[];
export type Headers = {[key: string]: string | boolean | number};

/** Function used to create the shared data object on each route call  */
export type SharedDataFactory<SharedData> = () => SharedData;

// ####### Raw Hooks #######

export type ErrorReturn = void | RouteError | Promise<RouteError | void>;

export type RawHooksCollection<
    Context extends CallContext = CallContext,
    RawReq extends RawRequest = RawRequest,
    RawResp = unknown,
    Opts extends RouterOptions<RawReq> = RouterOptions<RawReq>
> = {
    [key: string]: RawHookDef<Context, RawReq, RawResp, Opts>;
};

// ####### Private Hooks #######

export interface PrivateHookDef extends HookDef {
    canReturnData?: false | undefined;
    hook: (ctx?: any) => any;
}

export interface PrivateHeaderHookDef extends HeaderHookDef {
    canReturnData?: false | undefined;
    headerHook: (ctx?: any) => any;
}

export interface PrivateRawHookDef extends RawHookDef {
    rawHook: (ctx?: any, req?: any, resp?: any, opts?: any) => any;
}

// ####### Public Facing Types #######

export type PublicMethod<H extends Handler = any> = PublicRoute<H> | PublicHook<H>;

// prettier-ignore
/** Data structure containing all public data an types of routes & hooks. */
export type PublicMethods<Type extends Routes> = {
    [Property in keyof Type]: 
        // any private hook maps to null
        Type[Property] extends  
        | PrivateHookDef
        | PrivateHeaderHookDef
        | PrivateRawHookDef
        ? null
        // Hooks
        : Type[Property] extends HookDef
        ? PublicHook<Type[Property]['hook']>
        : Type[Property] extends HeaderHookDef
        ? PublicHook<Type[Property]['headerHook']>
        // Routes
        : Type[Property] extends RouteDef
        ? PublicRoute<Type[Property]['route']>
        : Type[Property] extends Handler
        ? PublicRoute<Type[Property]>
        // Routes & PureRoutes (recursion)
        : Type[Property] extends Routes
        ? PublicMethods<Type[Property]>
        : never;
};

export type OnlySuccess<Resp> = Exclude<Resp, RouteError | Error>;
export type PublicHandlerResponse<Resp> = Promise<[OnlySuccess<Awaited<Resp>> | null, PublicError | undefined]>;

// prettier-ignore
export type PublicHandler<H extends Handler> = 
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
    ? (...rest: Req) => Promise<[OnlySuccess<Awaited<Resp>> | null, PublicError | undefined]>
    : never;

/** Public map from Routes, _handler type is the same as router's handler but does not include the context  */
export type PublicRoute<H extends Handler> = {
    /** Type reference to the route handler, its value is actually null or void function ans should never be called. */
    _handler: PublicHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: true;
    path: string;
    inHeader: boolean;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
    publicExecutionPathPointers?: string[][];
};

/** Public map from Hooks, _handler type is the same as hooks's handler but does not include the context  */
export type PublicHook<H extends Handler> = {
    /** Type reference to the route handler, its value is actually null or void function ans should never be called. */
    _handler: PublicHandler<H>;
    /** Json serializable structure so the Type information can be transmitted over the wire */
    handlerSerializedType: SerializedTypes;
    isRoute: false;
    inHeader: boolean;
    fieldName: string;
    enableValidation: boolean;
    enableSerialization: boolean;
    params: string[];
};

export type SuccessResponse<R> = [R];
export type FailResponse = [null, PublicError];
export type PublicResponses = {
    [key: string]: SuccessResponse<any> | FailResponse;
};

// #######  type guards #######

export function isHandler(entry: RouterEntry): entry is Handler {
    return typeof entry === 'function';
}

export function isRouteDef(entry: RouterEntry): entry is RouteDef {
    return typeof (entry as RouteDef).route === 'function';
}

export function isHookDef(entry: RouterEntry): entry is HookDef {
    return typeof (entry as HookDef).hook === 'function';
}

export function isRawHookDef(entry: RouterEntry): entry is RawHookDef {
    return typeof (entry as RawHookDef).rawHook === 'function';
}

export function isHeaderHookDef(entry: RouterEntry): entry is HeaderHookDef {
    return typeof (entry as HeaderHookDef).headerHook === 'function';
}

export function isAnyHookDef(entry: RouterEntry): entry is HeaderHookDef | HookDef | RawHookDef {
    return isHookDef(entry) || isRawHookDef(entry) || isHeaderHookDef(entry);
}

export function isRoute(entry: RouterEntry): entry is Route {
    return typeof entry === 'function' || typeof (entry as RouteDef).route === 'function';
}

export function isRoutes(entry: RouterEntry | Routes): entry is Route {
    return typeof entry === 'object';
}

export function isExecutable(entry: Executable | {pathPointer: string[]}): entry is Executable {
    return (
        typeof (entry as Executable)?.path === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
}
export function isRawExecutable(entry: Executable): entry is RawExecutable {
    return entry.isRawExecutable;
}

export function isPublicExecutable(entry: Executable): entry is Executable {
    return entry.canReturnData || !!entry.reflection?.paramsLength;
}

export function isNotFoundExecutable(entry: Executable): entry is NotFoundExecutable {
    return (entry as NotFoundExecutable).is404;
}

// #######  Others #######

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};
