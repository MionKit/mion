/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {ReflectionOptions, FunctionReflection, SerializedTypes} from '@mionkit/runtype';
import {RouteError} from './errors';

// #######  Routes #######

export type SimpleHandler<Ret = any> = (
    /** Remote Call parameters */
    ...parameters: any
) => Ret | Promise<Ret>;

/** Route or Hook Handler, the remote function  */
export type Handler<Context extends CallContext = CallContext, Ret = any> = (
    /** Call Context */
    context: Context,
    /** Remote Call parameters */
    ...parameters: any
) => Ret | Promise<Ret>;

/** Route definition */
export type RouteDef<Context extends CallContext = CallContext, Ret = any> = {
    /** overrides route's path and fieldName in request/response body */
    path?: string;
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
    /** Route Handler */
    route: Handler<Context, Ret>;
};

/** Hook definition, a function that hooks into the execution path */
export type HookDef<Context extends CallContext = CallContext, Ret = any> = {
    /** Executes the hook even if an error was thrown previously */
    forceRunOnError?: boolean;
    /** Enables returning data in the responseBody,
     * hooks must explicitly enable returning data */
    canReturnData?: boolean;
    /** Sets the value in a heather rather than the body */
    inHeader?: boolean;
    /** The fieldName in the request/response body */
    fieldName?: string;
    /** Description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
    /** Hook handler */
    hook: Handler<Context, Ret> | SimpleHandler<Ret>;
};

/** A route can be a full route definition or just the handler */
export type Route<Context extends CallContext = CallContext, Ret = any> = RouteDef<Context, Ret> | Handler<Context, Ret>;

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export type Routes<Context extends CallContext = CallContext> = {
    [key: string]: HookDef<Context> | Route<Context> | Routes<Context>;
};

// ####### Router Options #######

/** Global Router Options */
export type RouterOptions<Req extends RawRequest = RawRequest> = {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** Transform the path before finding a route */
    pathTransform?: (request: Req, path: string) => string;
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
    /** response content type, @default "application/json; charset=utf-8" */
    responseContentType: string;
    /** Used to return public data when adding routes */
    getPublicRoutesData: boolean;
    /** lazy load function reflection, should improve cold start performance */
    lazyLoadReflection: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** Use AsyncLocalStorage to pass context to route handlers.
     * When enabled the route callContext can be obtained using the `getCallContext` function
     * instead passing the context as a parameter to the route handler.
     */
    useAsyncCallContext: boolean;
};

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
    isInternal: false;
    canReturnData: true;
    forceRunOnError: false;
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

// ####### Call Context #######

/** The call Context object passed as first parameter to any hook or route */
export type CallContext<SharedData = any, RawReq extends RawRequest = any, RawResp = any> = Readonly<{
    /** Route's path */
    path: Readonly<string>;
    /** Original Server request
     * i.e: '@types/aws-lambda/APIGatewayEvent'
     * or http/IncomingMessage */
    rawRequest: RawReq;
    /** Original Server response
     * i.e: http/ServerResponse */
    rawResponse?: RawResp;
    /** Router's own request object */
    request: Readonly<Request>;
    /** Router's own response object */
    response: Readonly<Response>;
    /** shared data between handlers (route/hooks) and that is not returned in the response. */
    shared: SharedData;
}>;

export type RawCallContext<RawReq extends RawRequest = RawRequest, RawResp = any> = Readonly<{
    /** Original Server request
     * i.e: '@types/aws-lambda/APIGatewayEvent'
     * or http/IncomingMessage */
    rawRequest: RawReq;
    /** Original Server response
     * i.e: http/ServerResponse */
    rawResponse?: RawResp;
}>;

// ####### REQUEST & RESPONSE #######

/** Router own request object */
export type Request = {
    /** parsed and headers */
    headers: Obj;
    /** parsed body */
    body: Obj;
    /** All errors thrown during the call are stored here so they can bee logged or handler by a some error handler hook */
    internalErrors: Readonly<RouteError[]>;
};

/** Router own response object */
export type Response = {
    statusCode: Readonly<number>;
    /** response errors: empty if there were no errors during execution */
    publicErrors: Readonly<PublicError[]>;
    /** response headers */
    headers: Headers;
    /** the router response data, JS object */
    body: Readonly<Obj>;
    /** json encoded response, contains data and errors if there are any. */
    json: Readonly<string>;
};

/** Any request Object used by the router must follow this interface */
export type RawRequest = {
    headers: {[header: string]: string | undefined | string[]} | undefined;
    body: string | null | undefined | {}; // eslint-disable-line @typescript-eslint/ban-types
};

export type Headers = {[key: string]: string | boolean | number};

/** Function used to create the shared data object on each route call  */
export type SharedDataFactory<SharedData> = () => SharedData;

// #######  Errors #######

// TODO: the interface for Public Errors is a bit confusing, maybe this should be called PublicError, review the way params are passed etc.
/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export type RouteErrorParams = {
    /** id of the error. */
    id?: number | string;
    /** response status code */
    statusCode: Readonly<number>;
    /** the message that will be returned in the response */
    publicMessage: Readonly<string>;
    /**
     * the error message, it is private and wont be returned in the response.
     * If not defined, it is assigned from originalError.message or publicMessage.
     */
    message?: Readonly<string>;
    /** options data related to the error, ie validation data */
    publicData?: Readonly<unknown>;
    /** original error used to create the RouteError */
    originalError?: Readonly<Error>;
    /** name of the error, if not defined it is assigned from status code */
    name?: Readonly<string>;
};

export type PublicError = {
    id?: number | string;
    name: Readonly<string>;
    statusCode: Readonly<number>;
    message: Readonly<string>;
    errorData?: Readonly<unknown>;
};

// ####### Internal Hooks #######

export type InternalHookHandler<
    Context extends CallContext = CallContext,
    Opts extends RouterOptions = RouterOptions,
    Ret = any
> = (ctx: Context, opts: Opts) => Ret | Promise<Ret>;

/**
 * Internal hook, used only to modify the call context.
 * Does not have serialization or validation enabled.
 * It is equivalent to:
 *  - forceRunOnError: true
 *  - canReturnData: false
 *  - inHeader: false
 *  - enableValidation: false
 *  - enableSerialization: false
 */
export type InternalHookDef<Context extends CallContext = CallContext> = {
    internalHook: InternalHookHandler<Context>;
};

export type InternalHooksCollection = {
    [key: string]: InternalHookDef<any>;
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
    H extends (ctx: CallContext, ...rest: infer Req) => infer Resp
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

export const isHandler = (entry: HookDef | Route | Routes): entry is Handler => {
    return typeof entry === 'function';
};
export const isRouteDef = (entry: HookDef | Route | Routes): entry is RouteDef => {
    return typeof (entry as RouteDef).route === 'function';
};
export const isHookDef = (entry: HookDef | Route | Routes): entry is HookDef => {
    return typeof (entry as HookDef).hook === 'function';
};
export const isRoute = (entry: HookDef | Route | Routes): entry is Route => {
    return typeof entry === 'function' || typeof (entry as RouteDef).route === 'function';
};
export const isRoutes = (entry: any): entry is Route => {
    return typeof entry === 'object';
};
export const isExecutable = (entry: Executable | {pathPointer: string[]}): entry is Executable => {
    return (
        typeof (entry as Executable)?.path === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
};
export function isInternalHook(entry: HookDef | InternalHookDef): entry is InternalHookDef {
    return typeof (entry as InternalHookDef).internalHook === 'function';
}
export function isRouteExecutable(entry: Executable): entry is InternalHookExecutable {
    return !entry.isInternal && entry.isRoute;
}
export function isHookExecutable(entry: Executable): entry is InternalHookExecutable {
    return !entry.isInternal && !entry.isRoute;
}
export function isInternalExecutable(entry: Executable): entry is InternalHookExecutable {
    return entry.isInternal;
}

export const isPuplicExecutable = (entry: Executable): entry is Executable => {
    return entry.canReturnData || !!entry.reflection.paramsLength;
};

export const isPuplicMethod = (entry: PublicRoute<any> | PublicHook<any>): entry is PublicMethod<any> => {
    return entry.canReturnData || !!entry.params.length;
};

// #######  Others #######

export type Obj = {
    [key: string]: any;
};

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};

export type Mutable<T> = {
    -readonly [P in keyof T]: T[P];
};
