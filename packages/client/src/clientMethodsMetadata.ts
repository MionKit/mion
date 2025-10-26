/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, isRpcError} from '@mionkit/core';
import {GET_REMOTE_METHODS_BY_ID} from '@mionkit/core';
import {ClientOptions, JitFunctionsById, RemoteMethodJIT, RequestBody} from './types';
import {PublicMethod, MethodsData} from '@mionkit/router';
import type {JitCompiledFnData, SerializableMethodsData, SerializablePublicMethod, PureFunctionData} from '@mionkit/core';
import {jitUtils} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {deserializeMethods} from '@mionkit/core';

/**  Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById
) {
    restoreFromLocalStorage(methodIds, options, metadataById, jitFunctionsById);
    const missingAfterLocal = methodIds.filter((path) => !metadataById.has(path));
    if (!missingAfterLocal.length) return;
    // TODO change for a configurable name
    const shouldReturnAllMethods = true;
    const body: RequestBody = {
        [GET_REMOTE_METHODS_BY_ID]: [missingAfterLocal, shouldReturnAllMethods],
    };
    try {
        const url = new URL(GET_REMOTE_METHODS_BY_ID, options.baseURL);
        const response = await fetch(url, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
        const respObj = await response.json();
        // Handle union type de-serialization manually: MethodsData | RpcError gets serialized as [discriminator, value]
        // where discriminator 0 = MethodsData, discriminator 1 = RpcError
        const respUnion = respObj[GET_REMOTE_METHODS_BY_ID];
        let resp: MethodsData | RpcError<any> | undefined;
        if (Array.isArray(respUnion) && respUnion.length === 2 && typeof respUnion[0] === 'number') {
            const [discriminator, value] = respUnion;
            if (discriminator === 0) {
                // MethodsData (first type in union)
                resp = value as MethodsData;
            } else if (discriminator === 1) {
                // RpcError (second type in union)
                resp = value as RpcError<any>;
            } else {
                throw new Error(`Invalid union discriminator: ${discriminator}`);
            }
        }

        if (!resp) throw new Error('No remote methods found in response');
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isRpcError(resp)) throw new RpcError(resp);

        // Convert MethodsData to SharedMethodsData format for restoration
        // Need to convert JSON objects back to Sets since JSON.parse converts Sets to {}
        const convertedDeps: Record<string, JitCompiledFnData> = {};
        Object.entries(resp.deps).forEach(([key, jitFn]: [string, any]) => {
            convertedDeps[key] = {
                ...jitFn,
                dependenciesSet: new Set(jitFn.dependenciesSet || []),
                pureFnDependencies: new Set(jitFn.pureFnDependencies || []),
            };
        });

        const convertedPureFnDeps: Record<string, PureFunctionData> = {};
        Object.entries(resp.purFnDeps).forEach(([key, pureFn]: [string, any]) => {
            convertedPureFnDeps[key] = {
                ...pureFn,
                dependencies: new Set(pureFn.dependencies || []),
            };
        });

        const serializableMethodsData: SerializableMethodsData = {
            methods: resp.methods as Record<string, SerializablePublicMethod>,
            deps: convertedDeps,
            purFnDeps: convertedPureFnDeps,
        };

        // Store dependencies globally for future use
        storeDependencies(serializableMethodsData.deps, serializableMethodsData.purFnDeps, options);
        storeMethodsMetadata(serializableMethodsData.methods, options);
        // Deserialize methods and their dependencies
        deserializeMethods(serializableMethodsData.deps, serializableMethodsData.purFnDeps);
        // Assign JIT functions to metadata
        createRemoteJItFunctions(serializableMethodsData, metadataById, jitFunctionsById);
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
export function storeMethodsMetadata(methods: Record<string, SerializablePublicMethod>, options: ClientOptions) {
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

    // Deserialize all dependencies if any were found
    if (Object.keys(deps).length > 0 || Object.keys(pureFnDeps).length > 0) {
        deserializeMethods(deps, pureFnDeps);
    }
}

/**
 * Restores method metadata from localStorage using the new storage format
 * Dependencies are assumed to be already loaded globally via restoreAllDependencies()
 */
function restoreFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById
) {
    const methods: Record<string, SerializablePublicMethod> = {};
    let anyMethodsRestored = false;

    methodIds.forEach((id) => {
        if (metadataById.has(id)) return;
        // Try to load method metadata using new storage key format
        const methodKey = getSerializedMethodDataKey(id, options);
        const methodMetaJson = localStorage.getItem(methodKey);
        if (methodMetaJson) {
            try {
                const methodMeta: SerializablePublicMethod = JSON.parse(methodMetaJson);
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
        createRemoteJItFunctions(serializableMethodsData, metadataById, jitFunctionsById);
    }
}

function createRemoteJItFunctions(
    serializableMethodsData: SerializableMethodsData,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById
) {
    Object.entries(serializableMethodsData.methods).forEach(([id, methodMeta]: [string, SerializablePublicMethod]) => {
        metadataById.set(id, methodMeta as PublicMethod);
        const remoteMethodsJit: RemoteMethodJIT = {
            params: {
                isType: jitUtils.getJIT(methodMeta.paramsJitHashes.isType)!,
                typeErrors: jitUtils.getJIT(methodMeta.paramsJitHashes.typeErrors)!,
                prepareForJson: jitUtils.getJIT(methodMeta.paramsJitHashes.prepareForJson)!,
                restoreFromJson: jitUtils.getJIT(methodMeta.paramsJitHashes.restoreFromJson)!,
                jsonStringify: jitUtils.getJIT(methodMeta.paramsJitHashes.jsonStringify)!,
            },
            return: {
                isType: jitUtils.getJIT(methodMeta.returnJitHashes.isType)!,
                typeErrors: jitUtils.getJIT(methodMeta.returnJitHashes.typeErrors)!,
                prepareForJson: jitUtils.getJIT(methodMeta.returnJitHashes.prepareForJson)!,
                restoreFromJson: jitUtils.getJIT(methodMeta.returnJitHashes.restoreFromJson)!,
                jsonStringify: jitUtils.getJIT(methodMeta.returnJitHashes.jsonStringify)!,
            },
        };
        jitFunctionsById.set(id, remoteMethodsJit);
    });
}
