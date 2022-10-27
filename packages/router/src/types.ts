/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {
    TypeFunction,
    Type,
    ValidationErrorItem,
    Serializer,
    SerializationOptions,
    NamingStrategy,
    JSONPartial,
    JSONSingle,
    TypePromise,
} from '@deepkit/type';
import {ReflectionKind} from '@deepkit/type';

// #######  Routes #######

/** Route or Hook Handler */
export type Handler = (context: Context<any, any, any, any>, ...args: any) => any | Promise<any>;

/** Route definition */
export type RouteObject = {
    /** overrides route's path and fieldName in request/response body */
    path?: string;
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
    /** Route Handler */
    route: Handler;
};

/** A route can be a full route definition or just the handler */
export type Route = RouteObject | Handler;

/** Hook definition */
export type Hook = {
    /** Executes the hook even if an error was thrown previously */
    forceRunOnError?: boolean;
    /** Enables returning data in the responseBody */
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
    hook: Handler;
};

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export type Routes = {
    [key: string]: Hook | Route | Routes;
};

// ####### Router Options #######

/** Global Router Options */
export type RouterOptions<ServerReq extends MkRequest = MkRequest> = {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** Transform the path before finding a route */
    pathTransform?: (request: ServerReq, path: string) => string;
    /** configures the fieldName in the request/response body used for a route's params/response */
    routeFieldName?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation: boolean;
    /** Enables serialization/deserialization */
    enableSerialization: boolean;
    /**
     * Deepkit Serialization Options
     * loosely defaults to false, Soft conversion disabled.
     * !! We Don't recommend to enable soft conversion as validation might fail
     * */
    serializationOptions: SerializationOptions;
    /**
     * Deepkit custom serializer
     * @link https://docs.deepkit.io/english/serialization.html#serialisation-custom-serialiser
     * */
    customSerializer?: Serializer;
    /**
     * Deepkit naming strategy
     * @link https://docs.deepkit.io/english/serialization.html#_naming_strategy
     * */
    serializerNamingStrategy?: NamingStrategy;
    /** Custom JSON parser, defaults to Native js JSON */
    jsonParser: JsonParser;
};

// ####### Execution Path #######

/** Data structure used control the execution path, an Executable is generated from each hook or route */
export type Executable = {
    nestLevel: number;
    path: string;
    forceRunOnError: boolean;
    canReturnData: boolean;
    inHeader: boolean;
    fieldName: string;
    isRoute: boolean;
    handler: Handler;
    paramValidators: RouteParamValidator[];
    paramsDeSerializers: RouteParamDeserializer[];
    outputSerializer: RouteOutputSerializer;
    handlerType: Type;
    isAsync: boolean;
    src?: Route | Hook;
    enableValidation: boolean;
    enableSerialization: boolean;
};

// ####### RESPONSE & RESPONSE #######

/** Any request Object used by the router must follow this interface */
export type MkRequest = {
    headers: {[header: string]: string | undefined | string[]} | undefined;
    body: string | null | undefined | {}; // eslint-disable-line @typescript-eslint/ban-types
};

/** Any error triggered by hooks or routes must follow this interface, returned errors in the body also follows this interface */
export type MkError = {
    statusCode: number;
    message: string;
};

export type MkHeaders = {[key: string]: string | boolean | number};

export type MkResponse = {
    statusCode: number;
    /** response errors: empty if there were no errors during execution */
    errors: MkError[];
    /** response headers */
    headers: MkHeaders;
    /** the router response data, JS object */
    data: MapObj;
    /** json encoded response, contains data and errors if there are any. */
    json: string;
};

// ####### Context #######

export type ServerCall<ServerReq extends MkRequest> = {
    /** Server request
     * i.e: '@types/aws-lambda/APIGatewayEvent'
     * or http/IncomingMessage */
    req: ServerReq;
};

/** The call Context object passed as first parameter to any hook or route */
export type Context<
    App,
    SharedData,
    ServerReq extends MkRequest,
    AnyServerCall extends ServerCall<ServerReq> = ServerCall<ServerReq>,
> = {
    /** Static Data: main App, db driver, libraries, etc... */
    app: Readonly<App>;
    server: Readonly<AnyServerCall>;
    /** Route's path */
    path: Readonly<string>;
    /** route errors, returned to the public */
    responseErrors: MkError[];
    /**
     * list of internal errors.
     * As router has no logging all errors are stored here so can be managed in a hook or externally
     */
    internalErrors: (MkError | any)[];
    /** parsed request.body */
    request: {
        headers: MapObj;
        body: MapObj;
    };
    /** returned data (non parsed) */
    reply: {
        headers: MapObj;
        body: MapObj;
    };
    /** shared data between route/hooks handlers */
    shared: SharedData;
};

/** Function used to create the shared data object on each route call  */
export type SharedDataFactory<SharedData> = () => SharedData;

// #######  reflection #######

export type RouteParamValidator = (data: any) => ValidationErrorItem[];
export type RouteParamDeserializer = <T>(data: JSONPartial<T>) => T;
export type RouteOutputSerializer = <T>(data: T) => JSONSingle<T>;

// #######  type guards #######

/** Type guard: isHandler */
export const isHandler = (entry: Hook | Route | Routes): entry is Handler => {
    return typeof entry === 'function';
};
/** Type guard: isRouteObject */
export const isRouteObject = (entry: Hook | Route | Routes): entry is RouteObject => {
    return typeof (entry as RouteObject).route === 'function';
};
/** Type guard: isHook */
export const isHook = (entry: Hook | Route | Routes): entry is Hook => {
    return typeof (entry as Hook).hook === 'function';
};
/** Type guard: isRoute */
export const isRoute = (entry: Hook | Route | Routes): entry is Route => {
    return typeof entry === 'function' || typeof (entry as RouteObject).route === 'function';
};
/** Type guard: isRoutes */
export const isRoutes = (entry: any): entry is Route => {
    return typeof entry === 'object';
};
/** Type guard: isExecutable */
export const isExecutable = (entry: Executable | {path: string}): entry is Executable => {
    return (
        typeof entry.path === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
};

export const isFunctionType = (t: Type): t is TypeFunction => t.kind === ReflectionKind.function;
export const isAsyncType = (t: Type): t is TypePromise =>
    t.kind === ReflectionKind.promise || t.kind === ReflectionKind.any || t.kind === ReflectionKind.unknown;

// #######  Others #######

export type MapObj = {
    [key: string]: any;
};

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};
