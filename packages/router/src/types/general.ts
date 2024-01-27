/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions} from '@mionkit/core';
import {CallContext, SharedDataFactory} from './context';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import {AnyHandler, Handler, HeaderHandler, RawHookHandler} from './handlers';
import {FunctionReflection, ReflectionOptions} from '@mionkit/reflection';

// #######  Router Object #######

/** A route can be a full route definition or just the handler */
export type Route<Context extends CallContext = CallContext, Ret = any> = RouteDef<Context, Ret>;

/** A route entry can be a route, a hook or sub-routes */
export type RouterEntry = HookDef | Route | Routes | RawHookDef | HeaderHookDef;

/** Data structure to define all the routes, each entry is a route a hook or sub-routes */
export interface Routes {
    [key: string]: RouterEntry;
}

// ####### Router Options #######

/** Global Router Options */
export interface RouterOptions<Req = any, SharedData = any> extends CoreOptions {
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
    /** enable automatic parameter validation, defaults to true */
    enableValidation: boolean;
    /** Enables serialization/deserialization */
    enableSerialization: boolean;
    /** Reflection and Deepkit Serialization-Validation options */
    reflectionOptions: ReflectionOptions;
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: JsonParser;
    /** Used to return public data structure when adding routes */
    getPublicRoutesData: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** client routes are initialized by default */
    skipClientRoutes: boolean;
}

// ####### Execution Path #######

/** Contains the data of each hook or route, Used to generate the execution path for each route. */
export type Executable = {
    nestLevel: number;
    id: string;
    forceRunOnError: boolean;
    canReturnData: boolean;
    inHeader: boolean;
    isRoute: boolean;
    isRawExecutable: boolean;
    handler: AnyHandler;
    reflection: FunctionReflection | null;
    // src: RouteDef | HookDef | RawHookDef;
    enableValidation: boolean;
    enableSerialization: boolean;
    /**
     * The pointer to the src Hook or Route definition within the original Routers object
     * ie: ['users','getUser']
     */
    pointer: string[];
    headerName?: string;
};

export interface RouteExecutable extends Executable {
    isRoute: true;
    isRawExecutable: false;
    forceRunOnError: false;
    canReturnData: true;
    handler: Handler;
    reflection: FunctionReflection;
}

export interface HookExecutable extends Executable {
    isRoute: false;
    isRawExecutable: false;
    handler: Handler | HeaderHandler;
    reflection: FunctionReflection;
}

export interface HookHeaderExecutable extends HookExecutable {
    inHeader: true;
    headerName: string;
}

export interface RawExecutable extends Executable {
    isRoute: false;
    isRawExecutable: true;
    canReturnData: false;
    handler: RawHookHandler;
    reflection: null;
}

export interface NotFoundExecutable extends Executable {
    is404: true;
}

// #######  Others #######

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};
