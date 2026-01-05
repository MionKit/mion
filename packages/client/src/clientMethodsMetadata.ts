/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, isRpcError, addRoutesToCache, resetRoutesCache, resetJitFnCaches} from '@mionkit/core';
import {MION_ROUTES} from '@mionkit/core';
import {ClientOptions, RequestBody} from './types';
import type {JitCompiledFnData, MethodMetadata, PureFunctionData, SerializableMethodsData} from '@mionkit/core';
import {routesCache, coreAOTLoadJitCaches, coreAOTLoadRoutesMetadataCache, addSerializedJitCaches} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {deserializeResponseBody} from './serializer';
import type {MionRoutes} from '@mionkit/router';

type GetRemoteMethodsMetadataById = MionRoutes[typeof MION_ROUTES.getRemoteMethodsMetadataById]['handler'];
type MethodsMetadataResponse = Awaited<ReturnType<GetRemoteMethodsMetadataById>>;
type GlobalErrorRoute = MionRoutes[typeof MION_ROUTES.platformError]['handler'];
type GlobalErrorResponse = Awaited<ReturnType<GlobalErrorRoute>>;

/**  Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(methodIds: string[], options: ClientOptions) {
    restoreFromLocalStorage(methodIds, options);
    const missingAfterLocal = methodIds.filter((path) => !routesCache.hasMetadata(path));
    if (!missingAfterLocal.length) return;
    // TODO change for a configurable name
    const shouldReturnAllMethods = true;
    const body: RequestBody = {
        [MION_ROUTES.getRemoteMethodsMetadataById]: [missingAfterLocal, shouldReturnAllMethods],
    };
    try {
        const url = new URL(MION_ROUTES.getRemoteMethodsMetadataById, options.baseURL);
        const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });

        // jit functions and routes metadata needs to be in caches before calling deserialize
        const deserialized = await deserializeResponseBody(response);
        const platformError = deserialized[MION_ROUTES.platformError] as GlobalErrorResponse | undefined;
        const serializableMethodsData = deserialized[MION_ROUTES.getRemoteMethodsMetadataById] as MethodsMetadataResponse;

        if (isRpcError(platformError)) throw platformError;
        if (isRpcError(serializableMethodsData)) throw serializableMethodsData;
        if (!serializableMethodsData)
            throw new RpcError({
                type: 'cant-fetch-remote-methods-metadata',
                publicMessage: 'Failed to fetch remote methods metadata',
                errorData: {response},
            });

        // Store dependencies globally for future use in localStorage
        storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
        storeMethodsMetadata(serializableMethodsData.methods, options);
        // Store method metadata and JIT cache dependencies in the routerCache and global JIT caches
        // This also deserializes and restores all JIT functions and pure functions
        addToCaches(serializableMethodsData);
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function getSerializedMethodDataKey(methodId: string, options: ClientOptions) {
    return `${STORAGE_KEY}:serialized-method-data:${options.baseURL}:${methodId}`;
}

function getJitCompiledFnKey(jitFnHash: string, options: ClientOptions) {
    return `${STORAGE_KEY}:jit-compiled-fn:${options.baseURL}:${jitFnHash}`;
}

function getJitPureFnKey(pureFnHash: string, options: ClientOptions) {
    return `${STORAGE_KEY}:jit-pure-fn:${options.baseURL}:${pureFnHash}`;
}

/**
 * Stores JIT compiled functions and pure functions globally in localStorage
 *
 * @example
 * // Store dependencies globally (called by fetchRemoteMethodsMetadata)
 * storeDependencies(deps, pureFnDeps, options);
 */
export function storeDependencies(
    deps: Record<string, JitCompiledFnData>,
    pureFnDeps: Record<string, PureFunctionData>,
    options: ClientOptions
) {
    // Store JIT compiled functions
    Object.entries(deps).forEach(([hash, jitFnData]: [string, JitCompiledFnData]) => {
        const key = getJitCompiledFnKey(hash, options);
        try {
            // Convert Sets to Arrays for JSON serialization since Sets are not JSON serializable
            const serializableJitFnData = {
                ...jitFnData,
                dependenciesSet: Array.from(jitFnData.dependenciesSet),
                pureFnDependencies: Array.from(jitFnData.pureFnDependencies),
            };
            localStorage.setItem(key, JSON.stringify(serializableJitFnData));
        } catch (error) {
            console.warn(`Failed to store JIT function dependency ${hash}:`, error);
        }
    });

    // Store pure functions
    Object.entries(pureFnDeps).forEach(([hash, pureFnData]: [string, PureFunctionData]) => {
        const key = getJitPureFnKey(hash, options);
        try {
            // Convert Set to Array for JSON serialization since Sets are not JSON serializable
            const serializablePureFnData = {
                ...pureFnData,
                dependencies: Array.from(pureFnData.dependencies),
            };
            localStorage.setItem(key, JSON.stringify(serializablePureFnData));
        } catch (error) {
            console.warn(`Failed to store pure function dependency ${hash}:`, error);
        }
    });
}

/**
 * Stores method metadata in localStorage using the new storage format
 *
 * @example
 * // Store method metadata (called by fetchRemoteMethodsMetadata)
 * storeMethodsMetadata(serializableMethodsData.methods, options);
 */
export function storeMethodsMetadata(methods: Record<string, MethodMetadata>, options: ClientOptions) {
    Object.entries(methods).forEach(([methodId, methodData]) => {
        const key = getSerializedMethodDataKey(methodId, options);
        try {
            localStorage.setItem(key, JSON.stringify(methodData));
        } catch (error) {
            console.warn(`Failed to store method metadata ${methodId}:`, error);
        }
    });
}

/**
 * Restores all JIT compiled functions and pure functions from localStorage and deserializes them
 *
 * @example
 * // Call this once at client initialization to restore all dependencies
 * restoreAllDependencies(options);
 *
 * // After this, all JIT functions are available in the cache and methods can be fetched as needed
 * await fetchRemoteMethodsMetadata(['method1', 'method2'], options, metadataById, jitFunctionsById);
 */
export function restoreAllDependencies(options: ClientOptions) {
    const deps: Record<string, JitCompiledFnData> = {};
    const pureFnDeps: Record<string, PureFunctionData> = {};

    // Restore JIT compiled functions
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${STORAGE_KEY}:jit-compiled-fn:${options.baseURL}:`)) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    const jitFnData: JitCompiledFnData = {
                        ...parsedData,
                        dependenciesSet: new Set(parsedData.dependenciesSet),
                        pureFnDependencies: new Set(parsedData.pureFnDependencies),
                    };
                    deps[jitFnData.jitFnHash] = jitFnData;
                }
            } catch (error) {
                console.warn(`Failed to restore JIT function from key ${key}:`, error);
            }
        }
    }

    // Restore pure functions
    for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(`${STORAGE_KEY}:jit-pure-fn:${options.baseURL}:`)) {
            try {
                const data = localStorage.getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    const pureFnData: PureFunctionData = {
                        ...parsedData,
                        dependencies: new Set(parsedData.dependencies),
                    };
                    pureFnDeps[pureFnData.pureFnHash] = pureFnData;
                }
            } catch (error) {
                console.warn(`Failed to restore pure function from key ${key}:`, error);
            }
        }
    }

    // Add all dependencies to the global JIT caches if any were found
    if (Object.keys(deps).length > 0 || Object.keys(pureFnDeps).length > 0) {
        addSerializedJitCaches(deps, pureFnDeps);
    }
}

/**
 * Restores method metadata from localStorage using the new storage format
 * Dependencies are assumed to be already loaded globally via restoreAllDependencies()
 */
function restoreFromLocalStorage(methodIds: string[], options: ClientOptions) {
    const methods: Record<string, MethodMetadata> = {};
    let anyMethodsRestored = false;

    methodIds.forEach((id) => {
        if (routesCache.hasMetadata(id)) return;
        // Try to load method metadata using new storage key format
        const methodKey = getSerializedMethodDataKey(id, options);
        const methodMetaJson = localStorage.getItem(methodKey);
        if (methodMetaJson) {
            try {
                const methodMeta: MethodMetadata = JSON.parse(methodMetaJson);
                methods[id] = methodMeta;
                anyMethodsRestored = true;
            } catch (error) {
                console.warn(`Failed to restore method metadata for ${id}:`, error);
                localStorage.removeItem(methodKey);
            }
        }
    });

    // If we restored any methods, process them
    if (anyMethodsRestored) {
        const serializableMethodsData: SerializableMethodsData = {
            methods,
            deps: {}, // Dependencies are already loaded globally
            purFnDeps: {}, // Dependencies are already loaded globally
        };
        addToCaches(serializableMethodsData);
    }
}

function addToCaches(serializableMethodsData: SerializableMethodsData) {
    addSerializedJitCaches(serializableMethodsData.deps, serializableMethodsData.purFnDeps);
    addRoutesToCache(serializableMethodsData.methods);
}

export function resetClientCaches() {
    resetRoutesCache();
    resetJitFnCaches();
    loadClientCaches();
}

function loadClientCaches() {
    // Load AOT caches from @mionkit/aot-caches
    // The client always needs these caches for serialization/deserialization
    // The router generates them at runtime so this is only needed for the client
    coreAOTLoadRoutesMetadataCache();
    coreAOTLoadJitCaches();

    // Validate that required MION_ROUTES are available in the router cache
    // These routes are required for the client to function properly
    const requiredRoutes = Object.values(MION_ROUTES);
    const missingRoutes = requiredRoutes.filter((routeId) => !routesCache.hasMetadata(routeId));
    if (missingRoutes.length > 0) {
        throw new Error(
            `AOT cache not loaded: Required MION_ROUTES not found in router cache: ${missingRoutes.join(', ')}. ` +
                `Make sure the AOT caches are properly generated and loaded.`
        );
    }
}

loadClientCaches();
