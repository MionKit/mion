/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, isRpcError, addRoutesToCache, isTestEnv} from '@mionjs/core';
import {MION_ROUTES, getRoutePath} from '@mionjs/core';
import {loadAOTCaches} from '../aot/aotCaches.ts';
import {ClientOptions, RequestBody} from '../types.ts';
import type {
    JitCompiledFnData,
    MethodsCache,
    MethodWithOptions,
    PureFunctionData,
    SerializableMethodsData,
    PureFnsDataCache,
} from '@mionjs/core';
import {routesCache, addSerializedJitCaches} from '@mionjs/core';
import {STORAGE_KEY} from '../constants.ts';

import {deserializeResponseBody} from './serializer.ts';
import {getStorage} from './storage.ts';
import type {MionRoutes} from '@mionjs/router';

type GetRemoteMethodsMetadataById = MionRoutes[typeof MION_ROUTES.methodsMetadataById]['handler'];
type MethodsMetadataResponse = Awaited<ReturnType<GetRemoteMethodsMetadataById>>;
type GlobalErrorRoute = MionRoutes[typeof MION_ROUTES.platformError]['handler'];
type GlobalErrorResponse = Awaited<ReturnType<GlobalErrorRoute>>;

/** Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(methodIds: string[], options: ClientOptions) {
    loadAOTCaches();
    validateClientCaches();
    restoreFromLocalStorage(methodIds, options);
    const missingAfterLocal = methodIds.filter((path) => !routesCache.hasMetadata(path));
    if (!missingAfterLocal.length) return;
    const shouldReturnAllMethods = true;
    const body: RequestBody = {
        [MION_ROUTES.methodsMetadataById]: [missingAfterLocal, shouldReturnAllMethods],
    };
    try {
        const path = getRoutePath([MION_ROUTES.methodsMetadataById], options);
        const url = new URL(path, options.baseURL);
        const response = await fetch(url, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });

        const deserialized = await deserializeResponseBody(response);
        const platformError = deserialized[MION_ROUTES.platformError] as GlobalErrorResponse | undefined;
        const serializableMethodsData = deserialized[MION_ROUTES.methodsMetadataById] as MethodsMetadataResponse;

        if (isRpcError(platformError)) throw platformError;
        if (isRpcError(serializableMethodsData)) throw serializableMethodsData;
        if (!serializableMethodsData)
            throw new RpcError({
                type: 'cant-fetch-remote-methods-metadata',
                publicMessage: 'Failed to fetch remote methods metadata',
                errorData: {response},
            });

        storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
        storeMethodsMetadata(serializableMethodsData.methods, options);
        addToCaches(serializableMethodsData);
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

function getSerializedMethodDataKey(methodId: string, options: ClientOptions) {
    return `${STORAGE_KEY}:serialized-method-data:${options.baseURL}:${methodId}`;
}

function getJitCompiledFnKey(jitFnHash: string, options: ClientOptions) {
    return `${STORAGE_KEY}:jit-compiled-fn:${options.baseURL}:${jitFnHash}`;
}

function getJitPureFnKey(namespace: string, pureFnHash: string, options: ClientOptions) {
    return `${STORAGE_KEY}:jit-pure-fn:${options.baseURL}:${namespace}:${pureFnHash}`;
}

/** Stores JIT compiled functions and pure functions globally in localStorage */
export function storeDependencies(deps: Record<string, JitCompiledFnData>, pureFnDeps: PureFnsDataCache, options: ClientOptions) {
    Object.entries(deps).forEach(([hash, jitFnData]: [string, JitCompiledFnData]) => {
        const key = getJitCompiledFnKey(hash, options);
        try {
            getStorage().setItem(key, JSON.stringify(jitFnData));
        } catch (error) {
            console.warn(`Failed to store JIT function dependency ${hash}:`, error);
        }
    });

    // Store namespaced pure functions
    Object.entries(pureFnDeps).forEach(([namespace, nsPureFns]) => {
        Object.entries(nsPureFns).forEach(([fnHash, pureFnData]: [string, PureFunctionData]) => {
            const key = getJitPureFnKey(namespace, fnHash, options);
            try {
                getStorage().setItem(key, JSON.stringify(pureFnData));
            } catch (error) {
                console.warn(`Failed to store pure function dependency ${namespace}::${fnHash}:`, error);
            }
        });
    });
}

/** Stores method metadata in localStorage using the new storage format */
export function storeMethodsMetadata(methods: MethodsCache, options: ClientOptions) {
    Object.entries(methods).forEach(([methodId, methodData]) => {
        const key = getSerializedMethodDataKey(methodId, options);
        try {
            getStorage().setItem(key, JSON.stringify(methodData));
        } catch (error) {
            console.warn(`Failed to store method metadata ${methodId}:`, error);
        }
    });
}

/** Restores all JIT compiled functions and pure functions from localStorage and deserializes them */
export function restoreAllDependencies(options: ClientOptions) {
    const deps: Record<string, JitCompiledFnData> = {};
    const pureFnDeps: PureFnsDataCache = {};
    const pureFnKeyPrefix = `${STORAGE_KEY}:jit-pure-fn:${options.baseURL}:`;

    for (let i = 0; i < getStorage().length; i++) {
        const key = getStorage().key(i);
        if (key?.startsWith(`${STORAGE_KEY}:jit-compiled-fn:${options.baseURL}:`)) {
            try {
                const data = getStorage().getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    deps[parsedData.jitFnHash] = parsedData;
                }
            } catch (error) {
                console.warn(`Failed to restore JIT function from key ${key}:`, error);
            }
        }
    }

    for (let i = 0; i < getStorage().length; i++) {
        const key = getStorage().key(i);
        if (key?.startsWith(pureFnKeyPrefix)) {
            try {
                const data = getStorage().getItem(key);
                if (data) {
                    const parsedData = JSON.parse(data);
                    // Extract namespace from key: "mion:jit-pure-fn:baseURL:namespace:fnHash"
                    const keyParts = key.slice(pureFnKeyPrefix.length).split(':');
                    const namespace = keyParts[0] || parsedData.namespace;
                    if (!pureFnDeps[namespace]) pureFnDeps[namespace] = {};
                    pureFnDeps[namespace][parsedData.fnName] = parsedData;
                }
            } catch (error) {
                console.warn(`Failed to restore pure function from key ${key}:`, error);
            }
        }
    }

    if (Object.keys(deps).length > 0 || Object.keys(pureFnDeps).length > 0) {
        addSerializedJitCaches(deps, pureFnDeps);
    }
}

/** Restores method metadata from localStorage using the new storage format */
function restoreFromLocalStorage(methodIds: string[], options: ClientOptions) {
    restoreAllDependencies(options);

    const methods: MethodsCache = {};
    let anyMethodsRestored = false;

    methodIds.forEach((id) => {
        if (routesCache.hasMetadata(id)) return;
        const methodKey = getSerializedMethodDataKey(id, options);
        const methodMetaJson = getStorage().getItem(methodKey);
        if (methodMetaJson) {
            try {
                const methodMeta: MethodWithOptions = JSON.parse(methodMetaJson);
                methods[id] = methodMeta;
                anyMethodsRestored = true;
            } catch (error) {
                console.warn(`Failed to restore method metadata for ${id}:`, error);
                getStorage().removeItem(methodKey);
            }
        }
    });

    if (anyMethodsRestored) {
        const serializableMethodsData: SerializableMethodsData = {
            methods,
            deps: {},
            purFnDeps: {},
        };
        addToCaches(serializableMethodsData);
    }
}

function addToCaches(serializableMethodsData: SerializableMethodsData) {
    addSerializedJitCaches(serializableMethodsData.deps, serializableMethodsData.purFnDeps);
    addRoutesToCache(serializableMethodsData.methods);
}

/** Validates that required MION_ROUTES are loaded in the cache. Skipped in test environments. */
let clientCachesValidated = false;
function validateClientCaches() {
    if (clientCachesValidated || isTestEnv()) return;
    clientCachesValidated = true;

    const requiredRoutes = Object.values(MION_ROUTES);
    const missingRoutes = requiredRoutes.filter((routeId) => !routesCache.hasMetadata(routeId));
    if (missingRoutes.length > 0) {
        throw new Error(
            `AOT cache not loaded: Required MION_ROUTES not found in router cache: ${missingRoutes.join(', ')}. ` +
                `Make sure the AOT caches are generated and bundled correctly.`
        );
    }
}
