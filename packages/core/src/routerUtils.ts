/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JIT_FUNCTION_IDS, PATH_SEPARATOR, ROUTER_ITEM_SEPARATOR_CHAR, ROUTE_PATH_ROOT} from './constants';
import {routerCache as aotRouterCache} from '@mionkit/aot-caches';
import type {MethodMetadata, MethodsCache, MethodWithJitFns} from './types/method.types';
import type {JitCompiledFunctions, JitFunctionsHashes} from './types/general.types';
import {jitUtils} from './jitUtils';

const methodsCache: MethodsCache = {};
let routesCacheLoaded = false;

/**
 * Utilities for accessing and modifying the router cache.
 * The router cache stores method metadata for both AOT-compiled routes and dynamically fetched routes.
 */
export const routesCache = {
    /**
     * Get method metadata from the router cache by id.
     * First checks the local cache, then falls back to the AOT cache.
     * @param id - The method id
     * @returns The method metadata or undefined if not found
     */
    getMetadata(id: string): MethodMetadata | undefined {
        // First check local cache
        if (id in methodsCache) {
            return methodsCache[id] as MethodMetadata | undefined;
        }
        // Fall back to AOT cache (for router package on-demand loading)
        if (id in aotRouterCache) {
            return aotRouterCache[id] as MethodMetadata | undefined;
        }
        return undefined;
    },

    /**
     * Set method metadata in the router cache
     * @param id - The method id
     * @param methodData - The method metadata
     */
    setMetadata(id: string, methodData: MethodMetadata): void {
        methodsCache[id] = methodData as any;
    },

    /**
     * Check if the router cache contains a method by id.
     * Checks both local cache and AOT cache.
     * @param id - The method id
     * @returns True if the method exists in either cache
     */
    hasMetadata(id: string): boolean {
        return id in methodsCache || id in aotRouterCache;
    },

    /**
     * Get the raw router cache object.
     * Use with caution - prefer using get/set/has methods.
     * @returns The router cache object
     */
    getCache(): Record<string, MethodMetadata> {
        return methodsCache as Record<string, MethodMetadata>;
    },

    /**
     * Clears the router cache.
     * This is useful for testing purposes only.
     */
    reset(): void {
        for (const k in methodsCache) delete methodsCache[k];
        routesCacheLoaded = false;
    },

    /**
     * Get method metadata with JIT functions restored from the router cache by id.
     * This augments the MethodMetadata with paramsJitFns and returnJitFns.
     * JIT functions are cached in the entry after first access for performance.
     * @param id - The method id
     * @returns The method metadata with JIT functions or undefined if not found
     */
    getMethodJitFns(id: string): MethodWithJitFns | undefined {
        // First check local cache (may already have JIT functions)
        if (id in methodsCache) {
            const cached = methodsCache[id] as any;
            // If JIT functions are already cached, return immediately
            if (cached.paramsJitFns && cached.returnJitFns) {
                return cached as MethodWithJitFns;
            }
        }

        // Get metadata (may come from AOT cache)
        const metadata = this.getMetadata(id);
        if (!metadata) return undefined;

        // Restore JIT functions from hashes
        const paramsJitFns = getJitFunctionsFromHash(metadata.paramsJitHash);
        const returnJitFns = getJitFunctionsFromHash(metadata.returnJitHash);
        const headersParam = metadata.headersParam
            ? {...metadata.headersParam, jitFns: getHeaderJitFunctionsFromHash(metadata.headersParam.jitHash)}
            : undefined;
        const headersReturn = metadata.headersReturn
            ? {...metadata.headersReturn, jitFns: getHeaderJitFunctionsFromHash(metadata.headersReturn.jitHash)}
            : undefined;

        // Build the augmented entry
        const result: MethodWithJitFns = {
            ...metadata,
            paramsJitFns,
            returnJitFns,
            headersParam,
            headersReturn,
        };

        // Cache the augmented entry for future calls
        methodsCache[id] = result;

        return result as MethodWithJitFns;
    },

    /**
     * Get method metadata with JIT functions restored from the router cache by id.
     * @param id
     * @returns
     */
    useMethodJitFns(id: string): MethodWithJitFns {
        const methodWithJitFns = this.getMethodJitFns(id);
        if (!methodWithJitFns) throw new Error(`Metadata for remote method ${id} not found`);
        return methodWithJitFns;
    },

    /**
     * Set method metadata with JIT functions in the router cache.
     * This stores the complete MethodWithJitFns object directly.
     * @param id - The method id
     * @param methodWithJitFns - The method metadata with JIT functions
     */
    setMethodJitFns(id: string, methodWithJitFns: MethodWithJitFns): void {
        methodsCache[id] = methodWithJitFns as any;
    },
};

/**
 * Loads the router cache from @mionkit/aot-caches.
 * This function should be called by the client package on initialization.
 * The router package generates routes at runtime so it does not need to call this function.
 * This function is idempotent - it will only load the cache once.
 */
export function coreAOTLoadRoutesMetadataCache(): void {
    if (routesCacheLoaded) return;
    routesCacheLoaded = true;
    for (const key in aotRouterCache) {
        if (!(key in methodsCache)) {
            // Clone the cache entry to avoid mutating the original
            methodsCache[key] = {...aotRouterCache[key]} as MethodMetadata;
        }
    }
}

/**
 * Adds new routes to the router cache
 * @param newCache
 */
export function addRoutesToCache(newCache: MethodsCache) {
    for (const key in newCache) {
        if (!(key in methodsCache)) {
            // Clone the cache entry to avoid mutating the original
            methodsCache[key] = {...newCache[key]} as MethodMetadata;
        }
    }
}

export function getJitFnHashes(jitHash: string): JitFunctionsHashes {
    return {
        isType: `${JIT_FUNCTION_IDS.isType}_${jitHash}`,
        typeErrors: `${JIT_FUNCTION_IDS.typeErrors}_${jitHash}`,
        prepareForJson: `${JIT_FUNCTION_IDS.prepareForJson}_${jitHash}`,
        restoreFromJson: `${JIT_FUNCTION_IDS.restoreFromJson}_${jitHash}`,
        jsonStringify: `${JIT_FUNCTION_IDS.jsonStringify}_${jitHash}`,
        toBinary: `${JIT_FUNCTION_IDS.toBinary}_${jitHash}`,
        fromBinary: `${JIT_FUNCTION_IDS.fromBinary}_${jitHash}`,
    };
}

/**
 * Helper function to get JIT functions from a JIT hash
 */
function getJitFunctionsFromHash(jitHash: string): JitCompiledFunctions {
    const hashes = getJitFnHashes(jitHash);
    return {
        isType: jitUtils.getJIT(hashes.isType),
        typeErrors: jitUtils.getJIT(hashes.typeErrors),
        prepareForJson: jitUtils.getJIT(hashes.prepareForJson),
        restoreFromJson: jitUtils.getJIT(hashes.restoreFromJson),
        jsonStringify: jitUtils.getJIT(hashes.jsonStringify),
        toBinary: jitUtils.getJIT(hashes.toBinary),
        fromBinary: jitUtils.getJIT(hashes.fromBinary),
    } as JitCompiledFunctions;
}

/**
 * Helper function to get header JIT functions from a JIT hash
 */
function getHeaderJitFunctionsFromHash(jitHash: string): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
    const hashes = getJitFnHashes(jitHash);
    return {
        isType: jitUtils.getJIT(hashes.isType),
        typeErrors: jitUtils.getJIT(hashes.typeErrors),
    } as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

/**
 * Get the router id for Routes or Hooks
 * @param itemPointer - The pointer to the item within the Routes object
 * i.e:
 * const routes = {
 *   auth: () => {},
 *   users: {
 *    getUser: () => {}
 *   }
 *   login: () => {}
 * }
 *
 * then the pointer for getUser is => ['users', 'getUser']
 */
export function getRouterItemId(itemPointer: string[]) {
    return itemPointer.join(ROUTER_ITEM_SEPARATOR_CHAR);
}

/** Gets a route path from a route pointer */
export function getRoutePath(pathPointer: string[], routerOptions: {prefix: string; suffix: string}) {
    const pathId = getRouterItemId(pathPointer);
    const prefix = routerOptions.prefix.startsWith(ROUTE_PATH_ROOT)
        ? routerOptions.prefix
        : `${ROUTE_PATH_ROOT}${routerOptions.prefix}`;
    const routePath = prefix.endsWith(PATH_SEPARATOR) ? `${prefix}${pathId}` : `${prefix}${PATH_SEPARATOR}${pathId}`;
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function resetRoutesCache() {
    for (const k in methodsCache) delete methodsCache[k];
    routesCacheLoaded = false;
}
