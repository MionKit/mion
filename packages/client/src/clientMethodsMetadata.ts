/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, isRpcError} from '@mionkit/core/errors';
import {GET_REMOTE_METHODS_BY_ID} from '@mionkit/core/constants';
import {ClientOptions, JitFunctionsById, RemoteMethodJIT, RequestBody} from './types';
import {PublicMethod, MethodsData} from '@mionkit/router';
import type {JitCompiledFnData} from '@mionkit/core/types';
import {jitUtils} from '@mionkit/core/jitUtils';
import {STORAGE_KEY} from './constants';

/**  Manually calls mionGetRemoteMethodsInfoById to get Remote Api Metadata */
export async function fetchRemoteMethodsMetadata(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
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
        const resp = respObj[GET_REMOTE_METHODS_BY_ID] as MethodsData | RpcError;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isRpcError(resp)) throw new RpcError(resp);
        if (!resp) throw new Error('No remote methods found in response');

        // Store JIT function dependencies in the cache
        Object.entries(resp.deps).forEach(([hash, jitFnData]) => {
            jitUtils.addToJitCache({
                ...jitFnData,
                closureFn: () => () => true, // Placeholder closure
                fn: () => true, // Placeholder function
            });
        });

        Object.entries(resp.methods).forEach(([id, methodMeta]: [string, PublicMethod]) => {
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, jitFunctionsById, resp.deps);
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

// ############# PRIVATE METHODS #############

function restoreMetadataFromLocalStorage(
    methodIds: string[],
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById
) {
    methodIds.map((id) => {
        if (metadataById.has(id)) return;
        const storageKey = getRemoteMethodLocalStorageKey(id, options);
        const methodMetaJson = localStorage.getItem(storageKey);
        if (!methodMetaJson) return;
        try {
            const methodMeta: PublicMethod = JSON.parse(methodMetaJson);
            setRemoteMethodMetadata(id, methodMeta, options, metadataById, jitFunctionsById, undefined, false);
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
    method: PublicMethod,
    options: ClientOptions,
    metadataById: Map<string, PublicMethod>,
    jitFunctionsById: JitFunctionsById,
    jitDeps?: Record<string, JitCompiledFnData>,
    store = true
) {
    metadataById.set(id, method);
    jitFunctionsById.set(id, getFunctionReflection(method.paramsJitHashes, method.returnJitHashes, jitDeps));
    if (store) {
        localStorage.setItem(getRemoteMethodLocalStorageKey(id, options), JSON.stringify(method));
    }
}

function getFunctionReflection(
    paramsHashes: any,
    responseHashes: any,
    jitDeps?: Record<string, JitCompiledFnData>
): RemoteMethodJIT {
    const jitParams = {
        isType: getJitFunctionFromHash(paramsHashes.isType, jitDeps),
        typeErrors: getJitFunctionFromHash(paramsHashes.typeErrors, jitDeps),
        toJsonVal: getJitFunctionFromHash(paramsHashes.toJsonVal, jitDeps),
        fromJsonVal: getJitFunctionFromHash(paramsHashes.fromJsonVal, jitDeps),
        jsonStringify: getJitFunctionFromHash(paramsHashes.jsonStringify, jitDeps),
    };
    const jitResponse = {
        isType: getJitFunctionFromHash(responseHashes.isType, jitDeps),
        typeErrors: getJitFunctionFromHash(responseHashes.typeErrors, jitDeps),
        toJsonVal: getJitFunctionFromHash(responseHashes.toJsonVal, jitDeps),
        fromJsonVal: getJitFunctionFromHash(responseHashes.fromJsonVal, jitDeps),
        jsonStringify: getJitFunctionFromHash(responseHashes.jsonStringify, jitDeps),
    };
    return {
        params: jitParams,
        return: jitResponse,
    };
}

function getJitFunctionFromHash(hash: string, jitDeps?: Record<string, JitCompiledFnData>): any {
    // Try to get the JIT function from the cache using the hash
    if (jitUtils.hasJitFn(hash)) {
        return {
            fn: jitUtils.getJitFn(hash),
            isNoop: false,
        };
    }

    // Try to get from the provided dependencies
    if (jitDeps && jitDeps[hash]) {
        const jitData = jitDeps[hash];
        return {
            fn: jitUtils.getJitFn(hash), // Should be available now since we added it to cache
            isNoop: jitData.isNoop || false,
        };
    }

    // If not found, return a noop function
    return {
        fn: () => true, // Default noop function
        isNoop: true,
    };
}

function getRemoteMethodLocalStorageKey(id: string, options: ClientOptions) {
    return `${STORAGE_KEY}:remote-method-info:${options.baseURL}:${id}`;
}
