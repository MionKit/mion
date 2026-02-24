/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, SerializerCode, SerializerModes, StatusCodes} from '@mionkit/core';
import {getRouteExecutionChain, getRouterOptions, startLinkedFns, endLinkedFns} from './router.ts';
import {RouterOptions} from './types/general.ts';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods.ts';
import {RoutesFlowExecutionResult} from './types/context.ts';

// ############# ROUTES_FLOW CACHE #############

/** FILO cache for merged execution chains. Key is the query string, value is the cached chain. */
const routesFlowCache = new Map<string, MethodsExecutionChain>();
const cacheOrder: string[] = [];

/** Clears the routesFlow cache - useful for testing */
export function clearRoutesFlowCache(): void {
    routesFlowCache.clear();
    cacheOrder.length = 0;
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

    // Parse CSV route paths from query string
    const routePaths = urlQuery
        .split(',')
        .map((p) => decodeURIComponent(p.trim()))
        .filter(Boolean);

    if (routePaths.length === 0) {
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
    if (executionChain) return {executionChain, routesFlowRouteIds: routeIds};

    // Build merged execution chain
    executionChain = buildMergedExecutionChain(routePaths, rawRequest, opts);
    addToRoutesFlowCache(urlQuery, executionChain);
    return {executionChain, routesFlowRouteIds: routeIds};
}

/**
 * Builds a merged execution chain from multiple route paths.
 * The merged chain includes all methods from all routes, with deduplication by ID.
 *
 * The chain is structured as:
 * 1. Start linkedFns (e.g., mionDeserializeRequest) - from first route, at the beginning
 * 2. Middle methods (routes and their linkedFns) - merged from all routes
 * 3. End linkedFns (e.g., mionSerializeResponse) - from first route, at the end
 *
 * This ensures that serialization happens AFTER all routes have executed.
 */
function buildMergedExecutionChain(routePaths: string[], rawRequest: unknown, opts: RouterOptions): MethodsExecutionChain {
    const seenIds = new Set<string>();
    const middleMethods: RemoteMethod[] = [];
    let resolvedSerializer: SerializerCode | undefined;
    let firstRouteIndex = -1;
    const defaultSerializerCode = SerializerModes[opts.serializer];

    // Build sets of start and end linkedFn IDs for filtering
    const startLinkedFnIds = new Set(startLinkedFns.map((m) => m.id));
    const endLinkedFnIds = new Set(endLinkedFns.map((m) => m.id));

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
            // Track the route index from the first route (relative to start linkedFns)
            firstRouteIndex = chain.routeIndex;
        } else if (resolvedSerializer !== chain.serializer) {
            resolvedSerializer = defaultSerializerCode;
        }

        // Add middle methods from this route's chain, deduplicating by ID
        // Skip start and end linkedFns - they will be added separately
        for (const method of chain.methods) {
            if (seenIds.has(method.id)) continue;
            if (startLinkedFnIds.has(method.id)) continue;
            if (endLinkedFnIds.has(method.id)) continue;
            seenIds.add(method.id);
            middleMethods.push(method);
        }
    }

    // Build final chain: start linkedFns + middle methods + end linkedFns
    const mergedMethods = [...startLinkedFns, ...middleMethods, ...endLinkedFns];

    return {
        // Use the first route's routeIndex since that's where the first route handler is
        routeIndex: firstRouteIndex,
        methods: mergedMethods,
        serializer: resolvedSerializer ?? defaultSerializerCode,
    };
}
