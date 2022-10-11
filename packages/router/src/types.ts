/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {EXECUTABLE_KEYS, ROUTES_WITH_ID_KEYS} from './constants';

export type RouteContext = {
    errors: [];
};

// #######  Router entries #######

export type Handler = (context: any, ...args: any) => any | void | Promise<any | void>;

export type RouteObject = {
    path?: string;
    inputFieldName?: string;
    outputFieldName?: string;
    route: Handler;
};

export type Route = RouteObject | Handler;

export type Hook = {
    stopOnError?: boolean; // Estop normal execution chain if error is thrown
    forceRunOnError?: boolean; // Executes the hook even if an error was thrown by another hook or route
    canReturnData?: boolean; // enables returning data in the responseBody
    returnInHeader?: boolean; // sets the value in a heather rather than the body
    fieldName?: string; // the fieldName in the request/response body
    hook: Handler;
};

export type Routes = {
    [key: string]: Hook | Route | Routes;
};

export type RoutesWithId = {
    path: string;
    routes: Routes;
};

// ####### Router Options #######

export type RouterOptions = {
    prefix: string;
    suffix: string;
};

// ####### Execution Path #######

export type Executable = {
    nestLevel: number;
    path: string;
    stopOnError: boolean;
    forceRunOnError: boolean;
    canReturnData: boolean;
    returnInHeader: boolean;
    inputFieldName: string;
    outputFieldName: string;
    isRoute: boolean;
    handler: Handler;
};

// ####### type guards #######

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
