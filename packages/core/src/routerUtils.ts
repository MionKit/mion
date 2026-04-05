/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JIT_FUNCTION_IDS, PATH_SEPARATOR, ROUTER_ITEM_SEPARATOR_CHAR, ROUTE_PATH_ROOT, EMPTY_HASH} from './constants.ts';
import type {RemoteMethodOpts, MethodWithOptions, MethodsCache, MethodWithOptsAndJitFns} from './types/method.types.ts';
import type {CoreRouterOptions, JitCompiledFn, JitCompiledFunctions, JitFunctionsHashes} from './types/general.types.ts';
import {getJitUtils} from './jit/jitUtils.ts';

const methodsCache: MethodsCache = {};
const methodsOptionsCache: Record<string, RemoteMethodOpts> = {};

// Cache for JitCompiledFunctions objects keyed by jitHash
const jitFunctionsCache = new Map<string, JitCompiledFunctions>();
const headerJitFunctionsCache = new Map<string, Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>>();

/**
 * Utilities for accessing and modifying the router cache.
 * The router cache stores method metadata for routes registered via addRoutesToCache() or virtual modules.
 */
export const routesCache = {
    /**
     * Get method metadata from the router cache by id.
     * @param id - The method id
     * @returns The method metadata or undefined if not found
     */
    getMetadata(id: string): MethodWithOptions | undefined {
        return methodsCache[id] as MethodWithOptions | undefined;
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
     * @param id - The method id
     * @returns True if the method exists in the cache
     */
    hasMetadata(id: string): boolean {
        return id in methodsCache;
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
     * Get method metadata with JIT functions restored from the router cache by id.
     * This augments the MethodWithOptions with paramsJitFns and returnJitFns.
     * JIT functions are cached in the entry after first access for performance.
     * @param id - The method id
     * @returns The method metadata with JIT functions or undefined if not found
     */
    getMethodJitFns(id: string): MethodWithOptsAndJitFns | undefined {
        if (id in methodsCache) {
            const cached = methodsCache[id] as any;
            if (cached.paramsJitFns && cached.returnJitFns) {
                return cached as MethodWithOptsAndJitFns;
            }
        }

        const metadata = this.getMetadata(id);
        if (!metadata) return undefined;

        const paramsJitFns = getJitFunctionsFromHash(metadata.paramsJitHash);
        const returnJitFns = getJitFunctionsFromHash(metadata.returnJitHash);
        const headersParam = metadata.headersParam
            ? {...metadata.headersParam, jitFns: getHeaderJitFunctionsFromHash(metadata.headersParam.jitHash)}
            : undefined;
        const headersReturn = metadata.headersReturn
            ? {...metadata.headersReturn, jitFns: getHeaderJitFunctionsFromHash(metadata.headersReturn.jitHash)}
            : undefined;

        const result: MethodWithOptsAndJitFns = {
            ...metadata,
            paramsJitFns,
            returnJitFns,
            headersParam,
            headersReturn,
        };

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
 * Adds new routes to the router cache.
 * This is the public API for registering routes - called by virtual modules or directly.
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
 * Results are cached to avoid creating duplicate objects.
 */
export function getJitFunctionsFromHash(jitHash: string): JitCompiledFunctions {
    // Empty hash means no JIT functions were generated (optimization for no params or void return)
    if (jitHash === EMPTY_HASH) return noopJitFns;

    // Check cache first
    const cached = jitFunctionsCache.get(jitHash);
    if (cached) return cached;

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

    // Cache for future calls
    jitFunctionsCache.set(jitHash, jitFns);
    return jitFns;
}

/**
 * Helper function to get header JIT functions from a JIT hash
 * Results are cached to avoid creating duplicate objects.
 */
export function getHeaderJitFunctionsFromHash(jitHash: string): Pick<JitCompiledFunctions, 'isType' | 'typeErrors'> {
    // Check cache first
    const cached = headerJitFunctionsCache.get(jitHash);
    if (cached) return cached;

    const hashes = getJitFnHashes(jitHash);
    const jUtils = getJitUtils();
    const jitFns = {
        isType: jUtils.getJIT(hashes.isType),
        typeErrors: jUtils.getJIT(hashes.typeErrors),
    } as Pick<JitCompiledFunctions, 'isType' | 'typeErrors'>;

    // Cache for future calls
    headerJitFunctionsCache.set(jitHash, jitFns);
    return jitFns;
}

/**
 * Get the router id for Routes or MiddleFns
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
export function getRoutePath(pathPointer: string[], routerOptions: CoreRouterOptions) {
    const pathId = getRouterItemId(pathPointer);
    const basePath = routerOptions.basePath.startsWith(ROUTE_PATH_ROOT)
        ? routerOptions.basePath
        : `${ROUTE_PATH_ROOT}${routerOptions.basePath}`;
    const routePath = basePath.endsWith(PATH_SEPARATOR) ? `${basePath}${pathId}` : `${basePath}${PATH_SEPARATOR}${pathId}`;
    return routerOptions.suffix ? routePath + routerOptions.suffix : routePath;
}

export function resetRoutesCache() {
    for (const k in methodsCache) delete methodsCache[k];
}

/** Resets the JIT functions cache. Useful for testing purposes only. */
export function resetJitFunctionsCache(): void {
    jitFunctionsCache.clear();
    headerJitFunctionsCache.clear();
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
