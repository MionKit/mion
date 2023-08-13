/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, PublicError, isPublicError} from '@mionkit/core';
import {ClientOptions, RequestBody} from './types';
import {RemoteMethod} from '@mionkit/router';
import {FunctionReflection, SerializedTypes, getDeserializedFunctionType, getFunctionReflectionMethods} from '@mionkit/runtype';
import {STORAGE_KEY} from './constants';

/**  Manually calls mionGetRemoteMethodsInfoById to get RemoteMethods Metadata */
export async function fetchRemoteMethodsInfo(
    methodIds: string[],
    options: ClientOptions,
    remoteMethodsById: Map<string, RemoteMethod>,
    reflectionById: Map<string, FunctionReflection>
) {
    restoreRemoteMethodsFromLocalStorage(methodIds, options, remoteMethodsById, reflectionById);
    const missingAfterLocal = methodIds.filter((path) => !remoteMethodsById.has(path));
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
        const resp = respObj[GET_REMOTE_METHODS_BY_ID] as {[key: string]: RemoteMethod} | PublicError;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isPublicError(resp)) throw new PublicError(resp);
        if (!resp) throw new Error('No remote methods found in response');

        Object.entries(resp).forEach(([id, remoteMethod]: [string, RemoteMethod]) => {
            setRemoteMethodMetadata(id, remoteMethod, options, remoteMethodsById, reflectionById);
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function restoreRemoteMethodsFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    remoteMethodsById: Map<string, RemoteMethod>,
    reflectionById: Map<string, FunctionReflection>
) {
    methodIds.map((id) => {
        if (remoteMethodsById.has(id)) return;
        const storageKey = getRemoteMethodLocalStorageKey(id, options);
        const remoteMethodJson = localStorage.getItem(storageKey);
        if (!remoteMethodJson) return;
        try {
            const remoteMethod: RemoteMethod = JSON.parse(remoteMethodJson);
            setRemoteMethodMetadata(id, remoteMethod, options, remoteMethodsById, reflectionById, false);
            if (remoteMethod.hookIds?.length)
                restoreRemoteMethodsFromLocalStorage(remoteMethod.hookIds, options, remoteMethodsById, reflectionById);
        } catch (e) {
            localStorage.removeItem(storageKey);
            return;
        }
    });
}

function setRemoteMethodMetadata(
    id: string,
    method: RemoteMethod,
    options: ClientOptions,
    remoteMethodsById: Map<string, RemoteMethod>,
    reflectionById: Map<string, FunctionReflection>,
    store = true
) {
    remoteMethodsById.set(id, method);
    reflectionById.set(id, getFunctionReflection(method.handlerSerializedType, options));
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
