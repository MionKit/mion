/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {Context as AWSContext, APIGatewayProxyCallback, APIGatewayEvent} from 'aws-lambda';
import type {TypeFunction, Type, ValidationErrorItem} from '@deepkit/type';
import {ReflectionKind} from '@deepkit/type';

// #######  Router entries #######

export type Handler = (context: any, ...args: any) => any | void | Promise<any | void>;

export type RouteObject = {
    path?: string; // overrides route's path
    inputFieldName?: string; // overrides request body input field name
    outputFieldName?: string; // overrides response body output field name
    description?: string; // description of the route, mostly for documentation purposes
    route: Handler;
};

export type Route<RouteType extends RouteObject = RouteObject> = RouteType | Handler;

export type Hook = {
    forceRunOnError?: boolean; // Executes the hook even if an error was thrown previously in the execution path
    canReturnData?: boolean; // enables returning data in the responseBody
    inHeader?: boolean; // sets the value in a heather rather than the body
    fieldName?: string; // the fieldName in the request/response body
    description?: string; // description of the route, mostly for documentation purposes
    hook: Handler;
};

export type Routes<RouteType extends Route = Route, HookType extends Hook = Hook> = {
    [key: string]: HookType | RouteType | Routes<RouteType, HookType>;
};

export type RoutesWithId<RouteType extends Route = Route, HookType extends Hook = Hook> = {
    path: string;
    routes: Routes<RouteType, HookType>;
};

// ####### Router Options #######

export type RouterOptions = {
    prefix: string;
    suffix: string;
    enableValidation: boolean;
};

// ####### Execution Path #######

export type Executable<RouteType extends Route = Route, HookType extends Hook = Hook> = {
    nestLevel: number;
    path: string;
    forceRunOnError: boolean;
    canReturnData: boolean;
    inHeader: boolean;
    inputFieldName: string;
    outputFieldName: string;
    isRoute: boolean;
    handler: Handler;
    paramValidators: RouteParamValidator[];
    src?: RouteType | HookType;
};

// ####### RESPONSE & RESPONSE #######
export type MkRequest = {
    headers: {[header: string]: string | undefined};
    body: string | null | undefined;
};

export type MkResponse = {
    statusCode: number;
    headers?: {[header: string]: boolean | number | string} | undefined;
    body: string | null;
};

export type MkError = {
    statusCode: number;
    message: string;
};

// ####### Context #######

export type Context<
    App,
    SharedData,
    ServerReq extends MkRequest,
    ServerResp extends MkResponse,
    RouteType extends Route = Route,
    HookType extends Hook = Hook,
> = {
    app: Readonly<App>; // Static Data: main App, db driver, libraries, etc...
    server: {
        req: Readonly<ServerReq>; // Server request, '@types/aws-lambda/APIGatewayEvent' when using aws lambda
        resp: Readonly<ServerResp>; // Server response, '@types/aws-lambda/APIGatewayProxyCallback' when using aws lambda
    };
    path: Readonly<string>;
    errors: MkError[]; // route errors, returned to the public
    privateErrors: (MkError | Error | any)[]; // private errors, can be used for logging etc
    /** parsed request.body */
    request: MapObj;
    reply: MapObj; // returned data (non parsed)
    shared?: SharedData; // shared data between route/hooks handlers
    src: Readonly<RouteType | HookType>; // the route/hook definition
};

export type SharedDataFactory<SharedData> = () => SharedData;

// #######  reflection #######

export type RouteParamValidator = (data: any) => ValidationErrorItem[];

// #######  type guards #######

export const isHandler = (entry: Hook | Route | Routes): entry is Handler => {
    return typeof entry === 'function';
};

export const isRouteObject = (entry: Hook | Route | Routes): entry is RouteObject => {
    return typeof (entry as RouteObject).route === 'function';
};

export const isHook = (entry: Hook | Route | Routes): entry is Hook => {
    return typeof (entry as Hook).hook === 'function';
};

export const isRoute = (entry: Hook | Route | Routes): entry is Route => {
    return typeof entry === 'function' || typeof (entry as RouteObject).route === 'function';
};

export const isRoutes = (entry: any): entry is Route => {
    return typeof entry === 'object';
};

export const isExecutable = (entry: Executable | RoutesWithId): entry is Executable => {
    return (
        typeof entry.path === 'string' &&
        ((entry as any).routes === 'undefined' || typeof (entry as Executable).handler === 'function')
    );
};

export const isFunctionType = (t: Type): t is TypeFunction => t.kind === ReflectionKind.function;

// #######  Others #######

export type MapObj = {
    [key: string]: any;
};

export type JsonParser = {parse: (s: string) => any; stringify: (any) => string};
