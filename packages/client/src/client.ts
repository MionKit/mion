/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getDeserializedFunctionType} from '@mionkit/runtype';
import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    ClientMethods,
    ClientOptions,
    RemoteHandlerResponse,
    RemoteHook,
    RemoteMethod,
    RemoteMethods,
    RemoteResponses,
    RemoteRoute,
    RequestBody,
} from './types';
import {GET_PUBLIC_METHODS_PATH, RouteError, StatusCodes} from '@mionkit/core';

// ############# PRIVATE STATE #############

const remoteMethodsByPath: Map<string, RemoteMethod> = new Map();

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

export function initClient<R extends RemoteMethods<any>>(): ClientMethods<R> {
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

function addToRequest(requestBody: RequestBody, path: string, params: any[]) {
    if (requestBody[path]) throw new Error(`Remote call to ${path} already exists in the request`);
    const remoteMethod = remoteMethodsByPath.get(path);
    if (!remoteMethod) throw new Error(`Remote call to ${path} not found in router`);
    requestBody[path] = params;
}

async function doFetch(request: RequestBody, path: string, skipSerialize = false): Promise<RemoteResponses> {
    const requestRemoteMethods = Object.keys(request);
    const missingMethods = requestRemoteMethods.filter((path) => !remoteMethodsByPath.has(path));
    await fetchRemoteMethodsInfo(missingMethods);

    if (!skipSerialize) {
        const {hasErrors, errors} = serializeAndValidateRequestBody(request);
        if (hasErrors) return errors;
    }

    try {
        const response = await fetch(`${clientOptions.apiURL}${path}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(request),
        });
        const respObj = await response.json();
        if (!skipSerialize) return deserializeResponseBody(respObj as RemoteResponses);
        return respObj as RemoteResponses;
    } catch (error: any) {
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Request Error',
            publicMessage: error?.message || 'Unknown error',
            originalError: error,
        });
    }
}

function serializeAndValidateRequestBody(request: RequestBody): {hasErrors: boolean; errors: RemoteResponses} {
    const errors: RemoteResponses = {};
    let hasErrors = false;
    Object.entries(request).forEach(([key, params]) => {
        try {
            const remoteMethod = remoteMethodsByPath.get(key);
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

            errors[key] = [null, routeError];
        }
    });
    return {hasErrors, errors};
}

function deserializeResponseBody(responseBody: RemoteResponses): RemoteResponses {
    const deSerializedBody = responseBody;
    Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
        try {
            const remoteMethod = remoteMethodsByPath.get(key);
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
    const missingAfterLocal = paths.filter((path) => !remoteMethodsByPath.has(path));
    if (!missingAfterLocal.length) return;
    const body: RequestBody = {
        [GET_PUBLIC_METHODS_PATH]: [missingAfterLocal],
    };
    try {
        const response = await fetch(`${clientOptions.apiURL}${GET_PUBLIC_METHODS_PATH}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(body),
        });
        const respObj = await response.json();
        const [remoteMethods, err] = respObj[GET_PUBLIC_METHODS_PATH] as RemoteHandlerResponse<RemoteMethods<any>>;
        // TODO: convert Public error into a class that extends error and throw as an error
        if (err) throw new Error(`${err.name}: ${err.message}`);
        if (!remoteMethods) throw new Error('No remote methods found in response');

        Object.entries(remoteMethods).forEach(([path, remoteMethod]) => {
            remoteMethodsByPath.set(path, remoteMethod);
            localStorage.setItem(getLocalStorageKeyForRemoteMethod(path), JSON.stringify(remoteMethod));
        });
    } catch (error: any) {
        throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
    }
}

function restoreRemoteMethodsFromLocalStorage(paths: string[]) {
    return paths.map((path) => {
        const storageKey = getLocalStorageKeyForRemoteMethod(path);
        const remoteMethodJson = localStorage.getItem(storageKey);
        if (!remoteMethodJson) return;
        try {
            const remoteMethod = JSON.parse(remoteMethodJson);
            remoteMethodsByPath.set(path, remoteMethod);
        } catch (e) {
            localStorage.removeItem(storageKey);
            return;
        }
    });
}

function getLocalStorageKeyForRemoteMethod(path: string) {
    return `${clientOptions.localStorageKey}:remote-methods:${path}`;
}

function serializeParameters(params: any[], method: RemoteMethod): any[] {
    if (!method.reflection) return params;
    if (params.length && method.enableSerialization) {
        try {
            params = method.reflection.serializeParams(params);
        } catch (e: any) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Serialization Error',
                publicMessage: `Invalid params '${method.path}', can not serialize. Parameters might be of the wrong type.`,
                originalError: e,
                publicData: e?.errors,
            });
        }
    }
    return params;
}

function validateParameters(params: any[], method: RemoteMethod): any[] {
    if (!method.reflection) return params;
    if (method.enableValidation) {
        const validationResponse = method.reflection.validateParams(params);
        if (validationResponse.hasErrors) {
            throw new RouteError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Validation Error',
                publicMessage: `Invalid params in '${method.path}', validation failed.`,
                publicData: validationResponse,
            });
        }
    }
    return params;
}

function deSerializeReturn(remoteHandlerResponse: RemoteHandlerResponse<any>, method: RemoteMethod): RemoteHandlerResponse<any> {
    if (!method.reflection || !method.enableSerialization) return remoteHandlerResponse;
    const result = remoteHandlerResponse[0];
    if (!result) return remoteHandlerResponse;
    try {
        const serialized = method.reflection.deserializeReturn(result);
        return [serialized, remoteHandlerResponse[1]];
    } catch (e: any) {
        throw new RouteError({
            statusCode: StatusCodes.BAD_REQUEST,
            name: 'Serialization Error',
            publicMessage: `Invalid params '${method.path}', can not serialize. Parameters might be of the wrong type.`,
            originalError: e,
            publicData: e?.errors,
        });
    }
}
