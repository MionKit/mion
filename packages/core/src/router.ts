/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PATH_SEPARATOR, ROUTER_ITEM_SEPARATOR_CHAR, ROUTE_PATH_ROOT} from './constants';
import {routerCache as aotRouterCache} from '@mionkit/aot-caches';
import type {SerializablePublicMethod} from './types';

// Local router cache - can be populated from AOT caches via loadRoutesCache()
const routerCache: Record<string, SerializablePublicMethod> = {};

let routesCacheLoaded = false;

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

/**
 * Utilities for accessing and modifying the router cache.
 * The router cache stores method metadata for both AOT-compiled routes and dynamically fetched routes.
 */
export const routerUtils = {
    /**
     * Get method metadata from the router cache by id.
     * First checks the local cache, then falls back to the AOT cache.
     * @param id - The method id
     * @returns The method metadata or undefined if not found
     */
    getMetadata(id: string): SerializablePublicMethod | undefined {
        // First check local cache
        if (id in routerCache) {
            return routerCache[id] as SerializablePublicMethod | undefined;
        }
        // Fall back to AOT cache (for router package on-demand loading)
        if (id in aotRouterCache) {
            return aotRouterCache[id] as SerializablePublicMethod | undefined;
        }
        return undefined;
    },

    /**
     * Set method metadata in the router cache
     * @param id - The method id
     * @param methodData - The method metadata
     */
    setMetadata(id: string, methodData: SerializablePublicMethod): void {
        routerCache[id] = methodData as any;
    },

    /**
     * Check if the router cache contains a method by id.
     * Checks both local cache and AOT cache.
     * @param id - The method id
     * @returns True if the method exists in either cache
     */
    hasMetadata(id: string): boolean {
        return id in routerCache || id in aotRouterCache;
    },

    /**
     * Get the raw router cache object.
     * Use with caution - prefer using get/set/has methods.
     * @returns The router cache object
     */
    getCache(): Record<string, SerializablePublicMethod> {
        return routerCache as Record<string, SerializablePublicMethod>;
    },

    /**
     * Clears the router cache.
     * This is useful for testing purposes only.
     */
    reset(): void {
        for (const k in routerCache) delete routerCache[k];
        routesCacheLoaded = false;
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

    // Merge AOT router cache into local cache
    for (const key in aotRouterCache) {
        if (!(key in routerCache)) {
            routerCache[key] = aotRouterCache[key] as SerializablePublicMethod;
        }
    }
}
