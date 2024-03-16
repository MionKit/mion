/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, RpcError, isRpcError} from '@mionkit/core';
import {ClientOptions, JitFunctionsById, RemoteMethodJIT, RequestBody} from './types';
import {PublicProcedure} from '@mionkit/router';
import type {JitFn, SerializableFunctions, SerializableJitFn} from '@mionkit/runtype';
import {STORAGE_KEY} from './constants';

/**  Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicProcedure>,
    jitFunctionsById: JitFunctionsById
) {
    restoreMetadataFromLocalStorage(methodIds, options, metadataById, jitFunctionsById);
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
        const resp = respObj[GET_REMOTE_METHODS_BY_ID] as {[key: string]: PublicProcedure} | RpcError;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isRpcError(resp)) throw new RpcError(resp);
        if (!resp) throw new Error('No remote methods found in response');

        Object.entries(resp).forEach(([id, methodMeta]: [string, PublicProcedure]) => {
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, jitFunctionsById);
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function restoreMetadataFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicProcedure>,
    jitFunctionsById: JitFunctionsById
) {
    methodIds.map((id) => {
        if (metadataById.has(id)) return;
        const storageKey = getRemoteMethodLocalStorageKey(id, options);
        const methodMetaJson = localStorage.getItem(storageKey);
        if (!methodMetaJson) return;
        try {
            const methodMeta: PublicProcedure = JSON.parse(methodMetaJson);
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, jitFunctionsById, false);
            if (methodMeta.hookIds?.length)
                restoreMetadataFromLocalStorage(methodMeta.hookIds, options, metadataById, jitFunctionsById);
        } catch (e) {
            localStorage.removeItem(storageKey);
            return;
        }
    });
}

function setRemoteMethodMetadata(
    id: string,
    method: PublicProcedure,
    options: ClientOptions,
    metadataById: Map<string, PublicProcedure>,
    jitFunctionsById: JitFunctionsById,
    store = true
) {
    metadataById.set(id, method);
    jitFunctionsById.set(id, getFunctionReflection(method.serializedFnParams, method.serializedFnReturn));
    if (store) {
        localStorage.setItem(getRemoteMethodLocalStorageKey(id, options), JSON.stringify(method));
    }
}

function getFunctionReflection(paramsFns: SerializableFunctions, responseFns: SerializableFunctions): RemoteMethodJIT {
    const jitParams = {
        isType: restoreJitFunction(paramsFns.isType),
        typeErrors: restoreJitFunction(paramsFns.typeErrors),
        jsonEncode: restoreJitFunction(paramsFns.jsonEncode),
        jsonDecode: restoreJitFunction(paramsFns.jsonDecode),
        jsonStringify: restoreJitFunction(paramsFns.jsonStringify),
    };
    const jitResponse = {
        isType: restoreJitFunction(responseFns.isType),
        typeErrors: restoreJitFunction(responseFns.typeErrors),
        jsonEncode: restoreJitFunction(responseFns.jsonEncode),
        jsonDecode: restoreJitFunction(responseFns.jsonDecode),
        jsonStringify: restoreJitFunction(responseFns.jsonStringify),
    };
    return {
        params: jitParams,
        return: jitResponse,
    };
}

function restoreJitFunction<Fn extends (args: any[]) => any>(serializedFn: SerializableJitFn<Fn>): JitFn<Fn> {
    return {
        varName: serializedFn.varName,
        code: serializedFn.code,
        fn: new Function(serializedFn.varName, serializedFn.code) as Fn,
    };
}

function getRemoteMethodLocalStorageKey(id: string, options: ClientOptions) {
    return `${STORAGE_KEY}:remote-method-info:${options.baseURL}:${id}`;
}
