/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, SerializerCode, SerializerModes, StatusCodes} from '@mionkit/core';
import {getRouteExecutionChain, getRouterOptions, startLinkedFns, endLinkedFns} from './router';
import {RouterOptions} from './types/general';
import {MethodsExecutionChain, RemoteMethod} from './types/remoteMethods';
import {WorkflowExecutionResult} from './types/context';

// ############# WORKFLOW CACHE #############

/** FILO cache for merged execution chains. Key is the query string, value is the cached chain. */
const workflowCache = new Map<string, MethodsExecutionChain>();
const cacheOrder: string[] = [];

/** Clears the workflow cache - useful for testing */
export function clearWorkflowCache(): void {
    workflowCache.clear();
    cacheOrder.length = 0;
}

/** Returns the current workflow cache size */
export function getWorkflowCacheSize(): number {
    return workflowCache.size;
}

/** Returns a cached workflow chain by query string */
export function getCachedWorkflow(query: string): MethodsExecutionChain | undefined {
    return workflowCache.get(query);
}

/** Adds a merged chain to the cache with FILO eviction */
function addToWorkflowCache(query: string, chain: MethodsExecutionChain): void {
    const routerOpts = getRouterOptions();
    const maxSize = routerOpts.maxWorkflowsCacheSize;
    // Caching disabled
    if (maxSize <= 0) return;
    // Evict oldest entries if cache is full (FILO - First In, Last Out)
    while (cacheOrder.length >= maxSize) {
        const oldestKey = cacheOrder.shift();
        if (oldestKey) workflowCache.delete(oldestKey);
    }
    workflowCache.set(query, chain);
    cacheOrder.push(query);
}

// ############# WORKFLOWS #############

/** Builds or retrieves a cached merged execution chain for workflow requests */
export function getWorkflowExecutionChain(rawRequest: unknown, opts: RouterOptions, urlQuery?: string): WorkflowExecutionResult {
    // Validate urlQuery is provided
    if (!urlQuery) {
        throw new RpcError({
            statusCode: StatusCodes.UNEXPECTED_ERROR,
            type: 'workflow-missing-query',
            publicMessage: 'Workflow request requires a query string with route paths.',
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
            type: 'workflow-empty-routes',
            publicMessage: 'Workflow request requires at least one route path in query string.',
        });
    }

    // Convert paths to route IDs (remove leading slash)
    const routeIds = routePaths.map((path) => (path.startsWith('/') ? path.slice(1) : path));

    // Check cache first
    let executionChain = workflowCache.get(urlQuery);
    if (executionChain) return {executionChain, workflowRouteIds: routeIds};

    // Build merged execution chain
    executionChain = buildMergedExecutionChain(routePaths, rawRequest, opts);
    addToWorkflowCache(urlQuery, executionChain);
    return {executionChain, workflowRouteIds: routeIds};
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
                type: 'workflow-route-not-found',
                publicMessage: `Route not found in workflow: ${routePath}`,
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
