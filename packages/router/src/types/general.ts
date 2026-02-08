/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {CoreOptions, SerializerMode} from '@mionkit/core';
import {ContextDataFactory} from './context';
import {HeadersLinkedFnDef, LinkedFnDef, RawLinkedFnDef, RouteDef} from './definitions';
import type {RunTypeOptions} from '@mionkit/run-types';
// #######  Router Object #######

/** A route can be a full route definition or just the handler */
export type Route = RouteDef;

/** A route entry can be a route, a linkedFn or sub-routes */
export type RouterEntry = Routes | LinkedFnDef | RouteDef | RawLinkedFnDef | HeadersLinkedFnDef;

/** Data structure to define all the routes, each entry is a route a linkedFn or sub-routes */
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
     * Can be overridden per-route using route options.
     * - 'json': Use prepareForJson, platform adapter handles JSON.stringify
     * - 'binary': Use toBinary JIT function for binary serialization
     * - 'stringifyJson': Use stringifyJson JIT function for optimized JSON serialization
     * @default 'stringifyJson'
     */
    serializer: SerializerMode;
    /** run type compiler options for linkedFns and routes */
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
     * Throws error if any route/linkedFn is missing from AOT cache.
     * @default false
     */
    aot: boolean;
    /**
     * Maximum size of the CallContext pool for reduced memory allocations.
     * When set to a value > 0, CallContext objects are reused from a pool
     * instead of creating new ones for each request. This can improve
     * performance in high-throughput scenarios by reducing GC pressure.
     * Set to 0 to disable pooling.
     * @default 0 (disabled)
     */
    maxContextPoolSize: number;
    /**
     * Maximum size of the workflow execution chain cache.
     * Caches merged execution chains for workflow requests to avoid
     * recalculating them on every request with the same route combination.
     * Uses FILO (First In, Last Out) eviction when cache is full.
     * Set to 0 to disable caching.
     * @default 100
     */
    maxWorkflowsCacheSize: number;
}
