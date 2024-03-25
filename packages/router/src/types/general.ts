/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions} from '@mionkit/core';
import {SharedDataFactory} from './context';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import type {RunTypeOptions} from '@mionkit/runtype';

// #######  Router Object #######

/** A route can be a full route definition or just the handler */
export type Route = RouteDef;

/** A route entry can be a route, a hook or sub-routes */
export type RouterEntry = Routes | HookDef | RouteDef | RawHookDef | HeaderHookDef;

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
    /** Enables json stringify using runTypes jit stringify function instead JSON.stringify */
    useJitStringify: boolean;
    /** run type compiler options for hooks and routes */
    runTypeOptions: RunTypeOptions;
    /** Custom JSON parser, defaults to Native js JSON */
    bodyParser: JsonParser;
    /** Used to return public data structure when adding routes */
    getPublicRoutesData: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** client routes are initialized by default */
    skipClientRoutes: boolean;
}

// #######  Others #######

export type JsonParser = {
    parse: (text: string) => any;
    stringify: (js) => string;
};
