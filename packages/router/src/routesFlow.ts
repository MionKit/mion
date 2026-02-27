/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    RpcError,
    SerializerCode,
    SerializerModes,
    StatusCodes,
    HandlerType,
    getNoopJitFns,
    PURE_SERVER_FN_NAMESPACE,
} from '@mionkit/core';
import {serverPureFnsCache} from 'virtual:mion-server-pure-fns';
import {getRouteExecutionChain, getRouterOptions, startMiddleFns, endMiddleFns} from './router.ts';
import {RouterOptions} from './types/general.ts';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods.ts';
import {RoutesFlowExecutionResult} from './types/context.ts';
import type {CallContext} from './types/context.ts';
import type {RoutesFlowQuery, RoutesFlowMapping} from '@mionkit/core';

// ############# ROUTES_FLOW CACHE #############

/** FILO cache for merged execution chains. Key is the query string, value is the cached chain. */
const routesFlowCache = new Map<string, MethodsExecutionChain>();
const cacheOrder: string[] = [];
/** Cache for mapping RemoteMethods keyed by their unique ID */
const mappingMethodCache = new Map<string, RemoteMethod>();

/** Clears the routesFlow cache and mapping method cache - useful for testing */
export function clearRoutesFlowCache(): void {
    routesFlowCache.clear();
    cacheOrder.length = 0;
    mappingMethodCache.clear();
}

/** Returns the current routesFlow cache size */
export function getRoutesFlowCacheSize(): number {
    return routesFlowCache.size;
}

/** Returns a cached routesFlow chain by query string */
export function getCachedRoutesFlow(query: string): MethodsExecutionChain | undefined {
    return routesFlowCache.get(query);
}

/** Adds a merged chain to the cache with FILO eviction */
function addToRoutesFlowCache(query: string, chain: MethodsExecutionChain): void {
    const routerOpts = getRouterOptions();
    const maxSize = routerOpts.maxRoutesFlowsCacheSize;
    // Caching disabled
    if (maxSize <= 0) return;
    // Evict oldest entries if cache is full (FILO - First In, Last Out)
    while (cacheOrder.length >= maxSize) {
        const oldestKey = cacheOrder.shift();
        if (oldestKey) routesFlowCache.delete(oldestKey);
    }
    routesFlowCache.set(query, chain);
    cacheOrder.push(query);
}

// ############# QUERY PARSING #############

/** Decodes a base64-encoded JSON routesFlow query string */
function decodeRoutesFlowQuery(urlQuery: string): RoutesFlowQuery {
    try {
        const jsonString = atob(urlQuery);
        return JSON.parse(jsonString) as RoutesFlowQuery;
    } catch (e: any) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'routesFlow-invalid-query',
            publicMessage: 'RoutesFlow query string is not valid base64-encoded JSON.',
            errorData: {parseError: e?.message || 'Unknown error'},
        });
    }
}

// ############# ROUTES_FLOW #############

/** Builds or retrieves a cached merged execution chain for routesFlow requests */
export function getRoutesFlowExecutionChain(
    rawRequest: unknown,
    opts: RouterOptions,
    urlQuery?: string
): RoutesFlowExecutionResult {
    // Validate urlQuery is provided
    if (!urlQuery) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'routesFlow-missing-query',
            publicMessage: 'RoutesFlow request requires a query string with route paths.',
        });
    }

    // Decode base64+JSON query
    const query = decodeRoutesFlowQuery(urlQuery);
    const routePaths = query.routes;
    const mappings = query.mappings;

    if (!routePaths || routePaths.length === 0) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'routesFlow-empty-routes',
            publicMessage: 'RoutesFlow request requires at least one route path in query string.',
        });
    }

    // Convert paths to route IDs (remove leading slash)
    const routeIds = routePaths.map((path) => (path.startsWith('/') ? path.slice(1) : path));

    // Check cache first
    let executionChain = routesFlowCache.get(urlQuery);
    if (executionChain) return {executionChain, routesFlowRouteIds: routeIds, mappings};

    // Build merged execution chain
    executionChain = buildMergedExecutionChain(routePaths, rawRequest, opts, mappings);
    addToRoutesFlowCache(urlQuery, executionChain);
    return {executionChain, routesFlowRouteIds: routeIds, mappings};
}

/**
 * Builds a merged execution chain from multiple route paths.
 * The merged chain includes all methods from all routes, with deduplication by ID.
 *
 * The chain is structured as:
 * 1. Start middleFns (e.g., mionDeserializeRequest) - from first route, at the beginning
 * 2. Middle methods (routes and their middleFns) - merged from all routes, with mapping steps inserted
 * 3. End middleFns (e.g., mionSerializeResponse) - from first route, at the end
 *
 * When mappings are provided, mapping steps are inserted after the source route
 * and before the target route to transform output → input.
 */
function buildMergedExecutionChain(
    routePaths: string[],
    rawRequest: unknown,
    opts: RouterOptions,
    mappings?: RoutesFlowMapping[]
): MethodsExecutionChain {
    const seenIds = new Set<string>();
    const middleMethods: RemoteMethod[] = [];
    let resolvedSerializer: SerializerCode | undefined;
    let firstRouteIndex = -1;
    const defaultSerializerCode = SerializerModes[opts.serializer];

    // Build sets of start and end middleFn IDs for filtering
    const startMiddleFnIds = new Set(startMiddleFns.map((m) => m.id));
    const endMiddleFnIds = new Set(endMiddleFns.map((m) => m.id));

    // Process each route path
    for (const routePath of routePaths) {
        // Apply path transform if configured
        const transformedPath = opts.pathTransform?.(rawRequest, routePath) || routePath;
        const chain = getRouteExecutionChain(transformedPath);
        if (!chain) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'routesFlow-route-not-found',
                publicMessage: `Route not found in routesFlow: ${routePath}`,
                errorData: {routePath},
            });
        }

        // Resolve serializer - use first route's serializer, or fall back to default if conflicting
        if (!resolvedSerializer) {
            resolvedSerializer = chain.serializer;
            // Track the route index from the first route (relative to start middleFns)
            firstRouteIndex = chain.routeIndex;
        } else if (resolvedSerializer !== chain.serializer) {
            resolvedSerializer = defaultSerializerCode;
        }

        // Add middle methods from this route's chain, deduplicating by ID
        // Skip start and end middleFns - they will be added separately
        for (const method of chain.methods) {
            if (seenIds.has(method.id)) continue;
            if (startMiddleFnIds.has(method.id)) continue;
            if (endMiddleFnIds.has(method.id)) continue;
            seenIds.add(method.id);
            middleMethods.push(method);
        }
    }

    // Insert mapping methods between source and target routes
    if (mappings && mappings.length > 0) {
        insertMappingMethods(middleMethods, mappings);
    }

    // Build final chain: start middleFns + middle methods + end middleFns
    const mergedMethods = [...startMiddleFns, ...middleMethods, ...endMiddleFns];

    return {
        // Use the first route's routeIndex since that's where the first route handler is
        routeIndex: firstRouteIndex,
        methods: mergedMethods,
        serializer: resolvedSerializer ?? defaultSerializerCode,
    };
}

// ############# MAPPING METHODS #############

/**
 * Inserts mapping methods into the middleMethods array in the correct position.
 * Each mapping method is inserted after the source route (fromId) and before the target route (toId).
 * Mappings are processed in reverse insertion order to maintain correct indices.
 */
function insertMappingMethods(middleMethods: RemoteMethod[], mappings: RoutesFlowMapping[]): void {
    // Build a map of route ID → index in middleMethods for quick lookup
    const idToIndex = new Map<string, number>();
    for (let i = 0; i < middleMethods.length; i++) {
        idToIndex.set(middleMethods[i].id, i);
    }

    // Collect insertions: each mapping creates one insertion point
    const insertions: Array<{index: number; method: RemoteMethod}> = [];

    for (const mapping of mappings) {
        const fromIndex = idToIndex.get(mapping.fromId);
        const toIndex = idToIndex.get(mapping.toId);

        if (fromIndex === undefined) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'routesFlow-mapping-invalid-source',
                publicMessage: `Mapping source route '${mapping.fromId}' not found in routesFlow execution chain.`,
                errorData: {mapping},
            });
        }
        if (toIndex === undefined) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'routesFlow-mapping-invalid-target',
                publicMessage: `Mapping target route '${mapping.toId}' not found in routesFlow execution chain.`,
                errorData: {mapping},
            });
        }

        // Validate the pure function exists in the serverPureFnsCache (populated by mion vite plugin)
        if (!serverPureFnsCache[PURE_SERVER_FN_NAMESPACE]?.[mapping.bodyHash]?.fn) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'routesFlow-mapping-missing-pure-fn',
                publicMessage: `Mapping pure function '${mapping.bodyHash}' not found. Ensure the function is registered on the server.`,
                errorData: {mapping},
            });
        }

        // Insert after the source route (fromIndex + 1)
        insertions.push({
            index: fromIndex + 1,
            method: createMappingMethod(mapping),
        });
    }

    // Sort insertions by index descending so splice doesn't shift subsequent indices
    insertions.sort((a, b) => b.index - a.index);

    for (const {index, method} of insertions) {
        middleMethods.splice(index, 0, method);
    }
}

/** Creates or retrieves a cached RemoteMethod that acts as a raw middleFn to execute a mapping between routes */
function createMappingMethod(mapping: RoutesFlowMapping): RemoteMethod {
    const id = `mionMapFrom_${mapping.fromId}_${mapping.bodyHash}_to_${mapping.toId}`;
    const cached = mappingMethodCache.get(id);
    if (cached) return cached;

    const noopJitFns = getNoopJitFns();
    const method = {
        type: HandlerType.rawMiddleFn,
        id,
        isAsync: false,
        hasReturnData: false,
        paramsJitHash: '',
        returnJitHash: '',
        paramsJitFns: noopJitFns,
        returnJitFns: noopJitFns,
        handler: createMappingHandler(mapping),
        options: {runOnError: false, validateParams: false},
        methodCaller: runMappingHandler,
    } as RemoteMethod;

    mappingMethodCache.set(id, method);
    return method;
}

/** Creates the handler function for a mapping step */
function createMappingHandler(mapping: RoutesFlowMapping) {
    return (ctx: CallContext) => {
        // Get the output from the source route
        const sourceOutput = ctx.response.body[mapping.fromId];

        // Resolve and execute the pure function from serverPureFnsCache (populated by mion vite plugin)
        const entry = serverPureFnsCache[PURE_SERVER_FN_NAMESPACE]?.[mapping.bodyHash];
        if (!entry?.fn) {
            throw new RpcError({
                statusCode: StatusCodes.UNEXPECTED_ERROR,
                type: 'routesFlow-mapping-missing-pure-fn',
                publicMessage: `Mapping pure function '${mapping.bodyHash}' not found at runtime.`,
            });
        }
        const mappedValue = entry.fn(sourceOutput);

        // Replace null at paramIndex in target route's params
        const targetParams = ctx.request.body[mapping.toId] as any[];
        if (targetParams) (targetParams as any[])[mapping.paramIndex] = mappedValue;
    };
}

/** Custom method caller for mapping handlers — only passes the context */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
async function runMappingHandler(context: CallContext, executable: RemoteMethod, ...args: unknown[]) {
    return executable.handler(context);
}
