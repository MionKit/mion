/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JIT_FUNCTION_IDS, PATH_SEPARATOR, ROUTER_ITEM_SEPARATOR_CHAR, ROUTE_PATH_ROOT, EMPTY_HASH} from './constants';
import {routerCache as aotRouterCache} from '@mionkit/aot-caches';
import type {RemoteMethodOpts, MethodWithOptions, MethodsCache, MethodWithOptsAndJitFns} from './types/method.types';
import type {JitCompiledFn, JitCompiledFunctions, JitFunctionsHashes} from './types/general.types';
import {getJitUtils} from './jitUtils';

const methodsCache: MethodsCache = {};
const methodsOptionsCache: Record<string, RemoteMethodOpts> = {};
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
    getMetadata(id: string): MethodWithOptions | undefined {
        // First check local cache
        if (id in methodsCache) {
            return methodsCache[id] as MethodWithOptions | undefined;
        }
        // Fall back to AOT cache (for router package on-demand loading)
        if (id in aotRouterCache) {
            return aotRouterCache[id] as MethodWithOptions | undefined;
        }
        return undefined;
    },

    /**
     * Set method metadata in the router cache
     * @param id - The method id
     * @param methodData - The method metadata
     */
    setMetadata(id: string, methodData: MethodWithOptions): void {
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
    getCache(): MethodsCache {
        return methodsCache;
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
     * This augments the MethodWithOptions with paramsJitFns and returnJitFns.
     * JIT functions are cached in the entry after first access for performance.
     * @param id - The method id
     * @returns The method metadata with JIT functions or undefined if not found
     */
    getMethodJitFns(id: string): MethodWithOptsAndJitFns | undefined {
        // First check local cache (may already have JIT functions)
        if (id in methodsCache) {
            const cached = methodsCache[id] as any;
            // If JIT functions are already cached, return immediately
            if (cached.paramsJitFns && cached.returnJitFns) {
                return cached as MethodWithOptsAndJitFns;
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
        const result: MethodWithOptsAndJitFns = {
            ...metadata,
            paramsJitFns,
            returnJitFns,
            headersParam,
            headersReturn,
        };

        // Cache the augmented entry for future calls
        methodsCache[id] = result;
        return result as MethodWithOptsAndJitFns;
    },

    /**
     * Get method metadata with JIT functions restored from the router cache by id.
     * @param id
     * @returns
     */
    useMethodJitFns(id: string): MethodWithOptsAndJitFns {
        const MethodWithOptsAndJitFns = this.getMethodJitFns(id);
        if (!MethodWithOptsAndJitFns) throw new Error(`Metadata for remote method ${id} not found`);
        return MethodWithOptsAndJitFns;
    },

    /**
     * Set method metadata with JIT functions in the router cache.
     * This stores the complete MethodWithOptsAndJitFns object directly.
     * @param id - The method id
     * @param MethodWithOptsAndJitFns - The method metadata with JIT functions
     */
    setMethodJitFns(id: string, MethodWithOptsAndJitFns: MethodWithOptsAndJitFns): void {
        methodsCache[id] = MethodWithOptsAndJitFns as any;
    },
};

export const methodOptsCache = {
    getMethodOptions(id: string): RemoteMethodOpts | undefined {
        return methodsOptionsCache[id];
    },
    setMethodOptions(id: string, options: RemoteMethodOpts): void {
        methodsOptionsCache[id] = options;
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
            methodsCache[key] = {...aotRouterCache[key]} as MethodWithOptions;
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
            methodsCache[key] = {...newCache[key]} as MethodWithOptions;
        }
    }
}

export function getJitFnHashes(jitHash: string): JitFunctionsHashes {
    return {
        isType: `${JIT_FUNCTION_IDS.isType}_${jitHash}`,
        typeErrors: `${JIT_FUNCTION_IDS.typeErrors}_${jitHash}`,
        prepareForJson: `${JIT_FUNCTION_IDS.prepareForJson}_${jitHash}`,
        restoreFromJson: `${JIT_FUNCTION_IDS.restoreFromJson}_${jitHash}`,
        stringifyJson: `${JIT_FUNCTION_IDS.stringifyJson}_${jitHash}`,
        toBinary: `${JIT_FUNCTION_IDS.toBinary}_${jitHash}`,
        fromBinary: `${JIT_FUNCTION_IDS.fromBinary}_${jitHash}`,
    };
}

/**
 * Helper function to get JIT functions from a JIT hash
 * Returns nullJitFns for empty hash (handlers with no params or void return)
 */
export function getJitFunctionsFromHash(jitHash: string): JitCompiledFunctions {
    // Empty hash means no JIT functions were generated (optimization for no params or void return)
    if (jitHash === EMPTY_HASH) return noopJitFns;

    const hashes = getJitFnHashes(jitHash);
    const jUtils = getJitUtils();
    const jitFns = {
        isType: jUtils.getJIT(hashes.isType),
        typeErrors: jUtils.getJIT(hashes.typeErrors),
        prepareForJson: jUtils.getJIT(hashes.prepareForJson),
        restoreFromJson: jUtils.getJIT(hashes.restoreFromJson),
        stringifyJson: jUtils.getJIT(hashes.stringifyJson),
        toBinary: jUtils.getJIT(hashes.toBinary),
        fromBinary: jUtils.getJIT(hashes.fromBinary),
    } as JitCompiledFunctions;
    for (const key in jitFns) {
        if (!jitFns[key]) throw new Error(`Jit function ${key} not found for jitHash ${jitHash}`);
    }
    return jitFns;
}

/**
 * Helper function to get header JIT functions from a JIT hash
 */
export function getHeaderJitFunctionsFromHash(jitHash: string): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
    const hashes = getJitFnHashes(jitHash);
    const jUtils = getJitUtils();
    return {
        isType: jUtils.getJIT(hashes.isType),
        typeErrors: jUtils.getJIT(hashes.typeErrors),
    } as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;
}

/**
 * Get the router id for Routes or LinkedFns
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

// Noop JIT functions used for handlers with no params or void return
// prettier-ignore
const noopJitFns: JitCompiledFunctions = {
    isType: fakeJitFn(JIT_FUNCTION_IDS.isType),
    typeErrors: fakeJitFn(JIT_FUNCTION_IDS.typeErrors),
    prepareForJson: fakeJitFn(JIT_FUNCTION_IDS.prepareForJson),
    restoreFromJson: fakeJitFn(JIT_FUNCTION_IDS.restoreFromJson),
    stringifyJson: fakeJitFn(JIT_FUNCTION_IDS.stringifyJson),
    toBinary: fakeJitFn(JIT_FUNCTION_IDS.toBinary),
    fromBinary: fakeJitFn(JIT_FUNCTION_IDS.fromBinary),
} as any;

/** Creates a fake JIT function with isNoop=true for handlers with no params or void return */
function fakeJitFn(fnID: string): JitCompiledFn<any> {
    return {
        typeName: 'mionNoopJit',
        fnID,
        jitFnHash: EMPTY_HASH,
        args: {vλl: 'v'},
        defaultParamValues: {vλl: 'v'},
        isNoop: true,
        code: '',
        dependenciesSet: new Set<string>(),
        pureFnDependencies: new Set<string>(),
        createJitFn: () => {
            throw new Error('isNoop JIT functions should not be called, this is a function when jit is never used');
        },
        fn: () => {
            throw new Error('isNoop JIT functions should not be called, this is a function when jit is never used');
        },
    };
}

export function getNoopJitFns(): JitCompiledFunctions {
    return noopJitFns;
}
