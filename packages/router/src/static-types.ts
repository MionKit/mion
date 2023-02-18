/* ########
 * 2022 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Data} from '@deepkit/type';
import {ReflectionKind} from '@deepkit/type';
import {statusCodeToReasonPhrase} from './status-codes';

// #######  Routes #######

/** Route or Hook Handler, the remote function  */
export type SHandler<Params extends any[] = any[]> = (
    /** Static Data: main App, db driver, libraries, etc... */
    app: any,
    /** Call Context */
    context: any,
    /** Remote Call parameters */
    ...parameters: Params
) => any | Promise<any>;

/** Route definition */
export type RouteOptions = {
    /** overrides route's path and fieldName in request/response body */
    path?: string;
    /** description of the route, mostly for documentation purposes */
    description?: string;
    /** enable automatic parameter validation, defaults to true */
    enableValidation?: boolean;
    /** Enables serialization/deserialization */
    enableSerialization?: boolean;
};

/** Hook definition, a function that hooks into the execution path */
export type HookOptions = {
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
};

export type HookDef<H extends HookOptions> = {__meta?: ['hookOptions', H]};
export type RouteDef<R extends RouteOptions> = {__meta?: ['routeOptions', R]};
export type SRoute<R extends RouteOptions = any, Params extends any[] = any[]> = SHandler<Params> & RouteDef<R>;
export type SHook<H extends HookOptions = any, Params extends any[] = any[]> = SHandler<Params> & HookDef<H>;

export type RouteString<R extends RouteOptions = any> = string & RouteDef<R>;
export type HookString<H extends HookOptions = any> = string & HookDef<H>;

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export type SRoutes = {
    [key: string]: SRoute | SRoutes;
};

type HandlerReturn<H extends SRoute> = H extends RouteDef<any> & ((...params: infer Params) => infer Ret)
    ? ReturnType<(params: Params) => Ret>
    : never;
