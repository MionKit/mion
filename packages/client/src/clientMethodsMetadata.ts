/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, RpcError, isRpcError} from '@mionkit/core';
import {ClientOptions, RequestBody} from './types';
import {RemoteMethodMetadata} from '@mionkit/router';
import {
    FunctionReflection,
    SerializedTypes,
    getDeserializedFunctionType,
    getFunctionReflectionMethods,
} from '@mionkit/reflection';
import {STORAGE_KEY} from './constants';

/**  Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, RemoteMethodMetadata>,
    reflectionById: Map<string, FunctionReflection>
) {
    restoreMetadataFromLocalStorage(methodIds, options, metadataById, reflectionById);
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
        const resp = respObj[GET_REMOTE_METHODS_BY_ID] as {[key: string]: RemoteMethodMetadata} | RpcError;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isRpcError(resp)) throw new RpcError(resp);
        if (!resp) throw new Error('No remote methods found in response');

        Object.entries(resp).forEach(([id, methodMeta]: [string, RemoteMethodMetadata]) => {
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, reflectionById);
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function restoreMetadataFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, RemoteMethodMetadata>,
    reflectionById: Map<string, FunctionReflection>
) {
    methodIds.map((id) => {
        if (metadataById.has(id)) return;
        const storageKey = getRemoteMethodLocalStorageKey(id, options);
        const methodMetaJson = localStorage.getItem(storageKey);
        if (!methodMetaJson) return;
        try {
            const methodMeta: RemoteMethodMetadata = JSON.parse(methodMetaJson);
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, reflectionById, false);
            if (methodMeta.hookIds?.length)
                restoreMetadataFromLocalStorage(methodMeta.hookIds, options, metadataById, reflectionById);
        } catch (e) {
            localStorage.removeItem(storageKey);
            return;
        }
    });
}

function setRemoteMethodMetadata(
    id: string,
    method: RemoteMethodMetadata,
    options: ClientOptions,
    metadataById: Map<string, RemoteMethodMetadata>,
    reflectionById: Map<string, FunctionReflection>,
    store = true
) {
    metadataById.set(id, method);
    reflectionById.set(id, getFunctionReflection(method.serializedTypes, options));
    if (store) {
        localStorage.setItem(getRemoteMethodLocalStorageKey(id, options), JSON.stringify(method));
    }
}

function getFunctionReflection(serializedTypes: SerializedTypes, options: ClientOptions): FunctionReflection {
    const type = getDeserializedFunctionType(serializedTypes);
    return getFunctionReflectionMethods(type, options.reflectionOptions, 0);
}

function getRemoteMethodLocalStorageKey(id: string, options: ClientOptions) {
    return `${STORAGE_KEY}:remote-method-info:${options.baseURL}:${id}`;
}
