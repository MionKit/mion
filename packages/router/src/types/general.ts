/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions, SerializerMode, DeserializerMode} from '@mionkit/core';
import {ContextDataFactory} from './context';
import {HeaderHookDef, HookDef, RawHookDef, RouteDef} from './definitions';
import type {RunTypeOptions} from '@mionkit/run-types';
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
export interface RouterOptions<Req = any, ContextData extends Record<string, any> = any> extends CoreOptions {
    /** prefix for all routes, i.e: api/v1.
     * path separator is added between the prefix and the route */
    prefix: string;
    /** suffix for all routes, i.e: .json.
     * Not path separators is added between the route and the suffix */
    suffix: string;
    /** Transform the path before finding a route */
    pathTransform?: (request: Req, path: string) => string;
    /** factory function to initialize shared call context data */
    contextDataFactory?: ContextDataFactory<ContextData>;
    /**
     * Default serializer mode for response body serialization.
     * Can be overridden per-route/hook.
     * - 'json': Use prepareForJson, platform adapter handles JSON.stringify
     * - 'binary': Use toBinary JIT function for binary serialization
     * - 'stringifyJson': Use stringifyJson JIT function for optimized JSON serialization
     * @default 'stringifyJson'
     */
    serialize: SerializerMode;
    /**
     * Default deserializer mode for request body deserialization.
     * Can be overridden per-route/hook.
     * - 'json': Use restoreFromJson JIT function
     * - 'binary': Use fromBinary JIT function for binary deserialization
     * @default 'json'
     */
    deserialize: DeserializerMode;
    /** run type compiler options for hooks and routes */
    runTypeOptions: RunTypeOptions;
    /** Used to return public data structure when adding routes */
    getPublicRoutesData: boolean;
    /** automatically generate and uuid */
    autoGenerateErrorId: boolean;
    /** client routes are initialized by default */
    skipClientRoutes: boolean;
    /**
     * Enable AOT (Ahead-of-Time) mode.
     * When true, router will use pre-compiled JIT functions from cache
     * and will NOT load @mionkit/run-types package.
     * Throws error if any route/hook is missing from AOT cache.
     * @default false
     */
    aot: boolean;
}
