/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FunctionReflection, SerializedTypes, getDeserializedFunctionType, getFunctionReflectionMethods} from '@mionkit/runtype';
import {DEFAULT_PREFILL_OPTIONS, STORAGE_KEY} from './constants';
import {ClientMethods, ClientOptions, RequestBody} from './types';
import {GET_PUBLIC_METHODS_ID, PublicError, RouteError, StatusCodes, isPublicError} from '@mionkit/core';
import {PublicMethod, PublicMethods, PublicResponses, ResolvedPublicResponse, ResolvedPublicResponses} from '@mionkit/router';

// ############# PRIVATE STATE #############

const remoteMethodsById: Map<string, PublicMethod> = new Map();
const reflectionByPath: Map<string, FunctionReflection> = new Map();

let clientOptions: ClientOptions = {
    ...DEFAULT_PREFILL_OPTIONS,
};

export const setClientOptions = (prefillOptions_: Partial<ClientOptions> = {}) => {
    clientOptions = {
        ...clientOptions,
        ...prefillOptions_,
    };
};

type Chainable = (chain: Chainable[], proxy: typeof Proxy, params: any[]) => any;

const requestMethods = {
    preset: (...params: any[] | any) => 'preset called',
    params: (...params: any[] | any) => 'params called',
    fetch: () => 'fetch called',
};

const requestMethodsKeys = Object.keys(requestMethods);

export function initClient<R extends PublicMethods<any>>(): ClientMethods<R> {
    const target = {};

    const handler = {
        get(target, prop, receiver) {
            switch (prop) {
                case 'preset':
                    return requestMethods.preset;
                case 'params':
                    return requestMethods.params;
                case 'fetch':
                    return requestMethods.fetch;
                default:
                    return proxy;
            }
        },
    };

    const proxy = new Proxy(target, handler);
    return proxy;
}

function addToRequest(requestBody: RequestBody, id: string, params: any[]) {
    if (requestBody[id]) throw new Error(`Remote call to ${id} already exists in the request`);
    const remoteMethod = remoteMethodsById.get(id);
    if (!remoteMethod) throw new Error(`Remote call to ${id} not found in router`);
    requestBody[id] = params;
}

async function doFetch(request: RequestBody, path: string, skipSerialize = false): Promise<PublicResponses> {
    const requestRemoteMethods = Object.keys(request);
    const missingMethods = requestRemoteMethods.filter((id) => !remoteMethodsById.has(id));
    await fetchRemoteMethodsInfo(missingMethods);

    if (!skipSerialize) {
        const {hasErrors, errors} = serializeAndValidateRequestBody(request);
        if (hasErrors) return errors;
    }

    try {
        const url = new URL(path, clientOptions.baseURL);
        const response = await fetch(url, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(request),
        });
        const respObj = await response.json();
        if (!skipSerialize) return deserializeResponseBody(respObj as PublicResponses);
        return respObj as PublicResponses;
    } catch (error: any) {
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Request Error',
            publicMessage: error?.message || 'Unknown error',
            originalError: error,
        });
    }
}

function serializeAndValidateRequestBody(request: RequestBody): {hasErrors: boolean; errors: ResolvedPublicResponses} {
    const errors: ResolvedPublicResponses = {};
    let hasErrors = false;
    Object.entries(request).forEach(([key, params]) => {
        try {
            const remoteMethod = remoteMethodsById.get(key);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
            const validated = validateParameters(params, remoteMethod);
            const serialized = serializeParameters(validated, remoteMethod);
            request[key] = serialized;
        } catch (error: any | RouteError | Error) {
            hasErrors = true;
            const routeError =
                error instanceof RouteError
                    ? error
                    : new RouteError({
                          statusCode: StatusCodes.BAD_REQUEST,
                          name: 'Serialization Error',
                          publicMessage: `Invalid params '${key}', can not serialize.`,
                          originalError: error,
                      });

            errors[key] = routeError;
        }
    });
    return {hasErrors, errors};
}

function deserializeResponseBody(responseBody: ResolvedPublicResponses): ResolvedPublicResponses {
    const deSerializedBody = responseBody;
    Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
        try {
            const remoteMethod = remoteMethodsById.get(key);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
            const deSerialized = deSerializeReturn(remoteHandlerResponse, remoteMethod);
            deSerializedBody[key] = deSerialized;
        } catch (error: any | RouteError | Error) {
            const routeError =
                error instanceof RouteError
                    ? error
                    : new RouteError({
                          statusCode: StatusCodes.BAD_REQUEST,
                          name: 'Serialization Error',
                          publicMessage: `Invalid params '${key}', can not serialize.`,
                          originalError: error,
                      });

            deSerializedBody[key] = [null, routeError];
        }
    });
    return deSerializedBody;
}

async function fetchRemoteMethodsInfo(paths: string[]) {
    restoreRemoteMethodsFromLocalStorage(paths);
    const missingAfterLocal = paths.filter((path) => !remoteMethodsById.has(path));
    if (!missingAfterLocal.length) return;
    const body: RequestBody = {
        [GET_PUBLIC_METHODS_ID]: [missingAfterLocal],
    };
    try {
        const url = new URL(GET_PUBLIC_METHODS_ID, clientOptions.baseURL);
        const response = await fetch(url, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
        const respObj = await response.json();
        const resp = respObj[GET_PUBLIC_METHODS_ID] as ResolvedPublicResponse<{[key: string]: PublicMethod}>;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (isPublicError(resp)) throw new PublicError(resp);
        if (!resp) throw new Error('No remote methods found in response');

        Object.entries(resp).forEach(([path, remoteMethod]: [string, PublicMethod]) => {
            setRemoteMethodMetadata(path, remoteMethod);
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

function restoreRemoteMethodsFromLocalStorage(paths: string[]) {
    return paths.map((path) => {
        const storageKey = getLocalStorageKey(path);
        const remoteMethodJson = localStorage.getItem(storageKey);
        if (!remoteMethodJson) return;
        try {
            const remoteMethod = JSON.parse(remoteMethodJson);
            setRemoteMethodMetadata(path, remoteMethod, false);
        } catch (e) {
            localStorage.removeItem(storageKey);
            return;
        }
    });
}

function getLocalStorageKey(id: string) {
    return `${STORAGE_KEY}:remote-methods:${id}`;
}

function serializeParameters(params: any[], method: PublicMethod): any[] {
    const reflection = reflectionByPath.get(method.id);
    if (!reflection) return params;
    if (params.length && method.enableSerialization) {
        try {
            params = reflection.serializeParams(params);
        } catch (e: any) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                publicMessage: `Invalid params '${method.id}', can not serialize. Parameters might be of the wrong type.`,
                originalError: e,
                publicData: e?.errors,
            });
        }
    }
    return params;
}

function validateParameters(params: any[], method: PublicMethod): any[] {
    const reflection = reflectionByPath.get(method.id);
    if (!reflection) return params;
    if (method.enableValidation) {
        const validationResponse = reflection.validateParams(params);
        if (validationResponse.hasErrors) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                publicMessage: `Invalid params in '${method.id}', validation failed.`,
                publicData: validationResponse,
            });
        }
    }
    return params;
}

function deSerializeReturn(
    remoteHandlerResponse: ResolvedPublicResponse<any>,
    method: PublicMethod
): ResolvedPublicResponse<any> {
    const reflection = reflectionByPath.get(method.id);
    if (!reflection || !method.enableSerialization) return remoteHandlerResponse;
    const result = remoteHandlerResponse[0];
    if (!result) return remoteHandlerResponse;
    try {
        const serialized = reflection.deserializeReturn(result);
        return [serialized, remoteHandlerResponse[1]];
    } catch (e: any) {
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            publicMessage: `Invalid params '${method.id}', can not serialize. Parameters might be of the wrong type.`,
            originalError: e,
            publicData: e?.errors,
        });
    }
}

function setRemoteMethodMetadata(id: string, method: PublicMethod, store = true) {
    remoteMethodsById.set(id, method);
    reflectionByPath.set(id, getFunctionReflection(method.handlerSerializedType));
    if (store) localStorage.setItem(getLocalStorageKey(id), JSON.stringify(method));
}

function getFunctionReflection(serializedTypes: SerializedTypes): FunctionReflection {
    const type = getDeserializedFunctionType(serializedTypes);
    return getFunctionReflectionMethods(type, clientOptions.routerOptions.reflectionOptions, 0);
}
