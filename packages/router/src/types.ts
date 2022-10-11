/* ########
 * 2021 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

export type RouteContext = {
    errors: [];
    input: any[];
    output: any;
};

// #######  Router entries #######

export type Handler = (context: any, ...args: any) => any | void | Promise<any | void>;

export type RouteObject = {
    path?: string; // overrides route's path
    inputFieldName?: string; // overrides request body input field name
    outputFieldName?: string; // overrides response body output field name
    route: Handler;
};

export type Route = RouteObject | Handler;

export type Hook = {
    stopOnError?: boolean; // Stops normal execution path if error is thrown
    forceRunOnError?: boolean; // Executes the hook even if an error was thrown previously in the execution path
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
