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
import {restoreSerializedMethods} from '@mionkit/core/src/serializedJitFn';

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
        let resp: MethodsData | RpcError | undefined;
        if (Array.isArray(respUnion) && respUnion.length === 2 && typeof respUnion[0] === 'number') {
            const [discriminator, value] = respUnion;
            if (discriminator === 0) {
                // MethodsData (first type in union)
                resp = value as MethodsData;
            } else if (discriminator === 1) {
                // RpcError (second type in union)
                resp = value as RpcError;
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

        // Use the new restoration functionality to properly restore all functions
        restoreSerializedMethods(serializableMethodsData);
        storeInLocalStorage(serializableMethodsData, options);
        restoreData(serializableMethodsData, metadataById, jitFunctionsById);
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function getRemoteMethodLocalStorageKey(id: string, options: ClientOptions) {
    return `${STORAGE_KEY}:remote-method-info:${options.baseURL}:${id}`;
}

function getMethodDepsLocalStorageKey(hash: string, options: ClientOptions) {
    return `${STORAGE_KEY}:remote-method-deps:${options.baseURL}:${hash}`;
}

function isPureFnDeps(hash: string) {
    return hash.startsWith('pf_');
}

// restore
function restoreFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById
) {
    const methods: Record<string, SerializablePublicMethod> = {};
    const deps: Record<string, JitCompiledFnData> = {};
    const purFnDeps: Record<string, PureFunctionData> = {};
    let dependenciesFailed = false;

    methodIds.forEach((id) => {
        if (metadataById.has(id)) return;
        const storageKey = getRemoteMethodLocalStorageKey(id, options);
        const methodMetaJson = localStorage.getItem(storageKey);
        if (!methodMetaJson) {
            dependenciesFailed = true;
            return;
        }
        try {
            const methodMeta: SerializablePublicMethod = JSON.parse(methodMetaJson);
            methods[id] = methodMeta;

            const paramsJitHashes = Object.values(methodMeta.paramsJitHashes);
            const returnJitHashes = Object.values(methodMeta.returnJitHashes);
            const allHashes = [...new Set([...paramsJitHashes, ...returnJitHashes])]; // Remove duplicates
            allHashes.forEach((h) => {
                // Skip if already processed
                if (deps[h] || purFnDeps[h]) return;

                const key = getMethodDepsLocalStorageKey(h, options);
                const dep = localStorage.getItem(key);
                if (!dep) throw new Error(`Jit function ${h} not found`);
                if (isPureFnDeps(h)) {
                    const parsedPureFn = JSON.parse(dep);
                    purFnDeps[h] = {
                        ...parsedPureFn,
                        dependencies: new Set(parsedPureFn.dependencies || []),
                    };
                    return;
                }
                const parsedJitFn = JSON.parse(dep);
                deps[h] = {
                    ...parsedJitFn,
                    dependenciesSet: new Set(parsedJitFn.dependenciesSet || []),
                    pureFnDependencies: new Set(parsedJitFn.pureFnDependencies || []),
                };
            });
            // eslint-disable-next-line @typescript-eslint/no-unused-vars
        } catch (error: any) {
            localStorage.removeItem(storageKey);
            dependenciesFailed = true;
            return;
        }
    });

    if (dependenciesFailed) return;

    const serializableMethodsData: SerializableMethodsData = {
        methods,
        deps,
        purFnDeps,
    };
    restoreSerializedMethods(serializableMethodsData);
    restoreData(serializableMethodsData, metadataById, jitFunctionsById);
}

function storeInLocalStorage(serializableMethodsData: SerializableMethodsData, options: ClientOptions) {
    const {methods, deps, purFnDeps} = serializableMethodsData;

    // Store each dependency (JIT functions and pure functions) individually
    Object.entries(deps).forEach(([hash, jitFnData]) => {
        const key = getMethodDepsLocalStorageKey(hash, options);
        try {
            // Convert Sets to Arrays for JSON serialization since Sets are not JSON serializable
            const serializableJitFnData = {
                ...jitFnData,
                dependenciesSet: Array.from(jitFnData.dependenciesSet),
                pureFnDependencies: Array.from(jitFnData.pureFnDependencies),
            };
            localStorage.setItem(key, JSON.stringify(serializableJitFnData));
        } catch (error) {
            // Handle localStorage quota exceeded or other storage errors
            console.warn(`Failed to store JIT function dependency ${hash}:`, error);
        }
    });

    Object.entries(purFnDeps).forEach(([hash, pureFnData]) => {
        const key = getMethodDepsLocalStorageKey(hash, options);
        try {
            // Convert Set to Array for JSON serialization since Sets are not JSON serializable
            const serializablePureFnData = {
                ...pureFnData,
                dependencies: Array.from(pureFnData.dependencies),
            };
            localStorage.setItem(key, JSON.stringify(serializablePureFnData));
        } catch (error) {
            // Handle localStorage quota exceeded or other storage errors
            console.warn(`Failed to store pure function dependency ${hash}:`, error);
        }
    });

    // Store each method individually using the same key format that restore expects
    Object.entries(methods).forEach(([methodId, methodMeta]) => {
        const storageKey = getRemoteMethodLocalStorageKey(methodId, options);
        try {
            localStorage.setItem(storageKey, JSON.stringify(methodMeta));
        } catch (error) {
            // Handle localStorage quota exceeded or other storage errors
            console.warn(`Failed to store method metadata ${methodId}:`, error);
        }
    });
}

function restoreData(
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
                toJsonVal: jitUtils.getJIT(methodMeta.paramsJitHashes.toJsonVal)!,
                fromJsonVal: jitUtils.getJIT(methodMeta.paramsJitHashes.fromJsonVal)!,
                jsonStringify: jitUtils.getJIT(methodMeta.paramsJitHashes.jsonStringify)!,
            },
            return: {
                isType: jitUtils.getJIT(methodMeta.returnJitHashes.isType)!,
                typeErrors: jitUtils.getJIT(methodMeta.returnJitHashes.typeErrors)!,
                toJsonVal: jitUtils.getJIT(methodMeta.returnJitHashes.toJsonVal)!,
                fromJsonVal: jitUtils.getJIT(methodMeta.returnJitHashes.fromJsonVal)!,
                jsonStringify: jitUtils.getJIT(methodMeta.returnJitHashes.jsonStringify)!,
            },
        };
        jitFunctionsById.set(id, remoteMethodsJit);
    });
}
