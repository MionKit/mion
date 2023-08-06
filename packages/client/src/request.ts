/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RemoteMethod, ResolvedPublicResponses, ResolvedResponse} from '@mionkit/router';
import {
    ClientOptions,
    HookRequest,
    MethodRequest,
    ReflectionById,
    RemoteCallResponse,
    RemoteMethodsById,
    RequestBody,
    RouteRequest,
} from './types';
import {FunctionReflection, SerializedTypes, getDeserializedFunctionType, getFunctionReflectionMethods} from '@mionkit/runtype';
import {
    GET_PUBLIC_METHODS_ID,
    PublicError,
    StatusCodes,
    getRoutePath,
    isPublicError,
    getRouterItemId,
    deserializeIfIsPublicError,
} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {deSerializeReturn, serializeParameters, validateParameters} from './reflection';

export class MionRequest<RR extends RouteRequest<any>, RHList extends HookRequest<any>[]> {
    requestBody: RequestBody = {};
    routeId = '';
    path = '';
    constructor(
        private route: RR,
        private hooks: RHList,
        private options: ClientOptions,
        private remoteMethodsById: RemoteMethodsById,
        private reflectionById: ReflectionById
    ) {
        this.routeId = route.id;
        this.path = getRoutePath(route.pointer, this.options);
        this.addRequestParams(route);
        hooks.forEach((hook) => this.addRequestParams(hook));
    }

    addRequestParams(methodRequest: MethodRequest<any>) {
        if (methodRequest.isResolved) throw new Error(`Request ${methodRequest.id} is already resolved`);
        if (this.requestBody[methodRequest.id]) throw new Error(`Params for ${methodRequest.id} already exists in the request`);
        this.requestBody[methodRequest.id] = methodRequest.params;
    }

    async runRoute(skipChecks = false): Promise<RemoteCallResponse<any, any>> {
        const remoteMethodIds = Object.keys(this.requestBody);
        const missingMethods = remoteMethodIds.filter((id) => !this.remoteMethodsById.has(id));
        if (!skipChecks) await this.fetchRemoteMethodsInfo(missingMethods);
        const missingPersistedIds = this.addMissingPersistedHookParams();

        const remoteCallResponse: RemoteCallResponse<any, any> = {
            routeResponse: null,
            hooksResponses: [],
            persistedHooksResponses: {},
            otherResponses: {},
            hasRouteError: false,
            hasHookErrors: false,
            hasOtherErrors: false,
            hasPersistedErrors: false,
            hasErrors: false,
        };

        if (!skipChecks) {
            this.validateAndSerialize(remoteCallResponse);
            if (remoteCallResponse.hasErrors) return remoteCallResponse;
        }

        try {
            const url = new URL(this.path, this.options.baseURL);
            const fetchOptions: RequestInit = {
                ...this.options.fetchOptions,
                headers: {
                    ...this.options.fetchOptions.headers,
                    // TODO: set headers from hook headers
                },
                body: JSON.stringify(this.requestBody),
            };
            const response = await fetch(url, fetchOptions);
            let respObj = await response.json();
            if (!skipChecks) respObj = this.deserializeResponseBody(respObj as ResolvedPublicResponses);
            this.assignResponses(remoteCallResponse, respObj, response.headers, missingPersistedIds);
        } catch (error: any) {
            remoteCallResponse.otherResponses['request-error'] = new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Request Error',
                message: error?.message || 'Unknown error',
            });
            remoteCallResponse.hasErrors = true;
        }

        return remoteCallResponse;
    }

    validateAndSerialize(remoteCallResponse: RemoteCallResponse<any, any>): void {
        this.validateRequestBody(remoteCallResponse);
        this.serializeRequestBody(remoteCallResponse);
        remoteCallResponse.hasRouteError = isPublicError(remoteCallResponse.routeResponse);
        remoteCallResponse.hasHookErrors = remoteCallResponse.hooksResponses.some((hookResp) => isPublicError(hookResp));
        remoteCallResponse.hasErrors = remoteCallResponse.hasRouteError || remoteCallResponse.hasHookErrors;
    }

    assignResponses(
        remoteCallResponse: RemoteCallResponse<any, any>,
        respBody: ResolvedPublicResponses,
        headers: Headers,
        missingPersistedIds: string[]
    ) {
        const processedIds: string[] = [];
        // assign route
        remoteCallResponse.routeResponse = deserializeIfIsPublicError(respBody[this.routeId]);
        remoteCallResponse.hasRouteError = isPublicError(remoteCallResponse.routeResponse);
        this.route.isResolved = true;
        this.route.return = remoteCallResponse.routeResponse;
        processedIds.push(this.routeId);

        // assign hooks
        this.hooks.forEach((hook) => {
            const remoteMethod = this.remoteMethodsById.get(hook.id);
            const inHeader = remoteMethod?.inHeader;
            const headerName = remoteMethod?.headerName || '';
            // header hooks can return errors in body.
            const value = inHeader ? headers.get(headerName) || respBody[headerName] : respBody[hook.id];
            hook.return = deserializeIfIsPublicError(value);
            remoteCallResponse.hooksResponses.push(hook.return);
            remoteCallResponse.hasHookErrors = remoteCallResponse.hasHookErrors || isPublicError(hook.return);
            hook.isResolved = true;
            processedIds.push(hook.id);
        });
        // assign others
        missingPersistedIds.forEach((id) => {
            if (respBody[id]) {
                const respValue = deserializeIfIsPublicError(respBody[id]);
                remoteCallResponse.persistedHooksResponses[id] = respValue;
                remoteCallResponse.hasPersistedErrors = remoteCallResponse.hasPersistedErrors || isPublicError(respValue);
                processedIds.push(id);
            }
        });

        const extraResponseIds = Object.keys(respBody).filter((x) => !processedIds.includes(x));
        extraResponseIds.forEach((id) => {
            const respValue = deserializeIfIsPublicError(respBody[id]);
            remoteCallResponse.otherResponses[id] = respValue;
            remoteCallResponse.hasOtherErrors = remoteCallResponse.hasOtherErrors || isPublicError(respValue);
        });
        remoteCallResponse.hasErrors =
            remoteCallResponse.hasRouteError ||
            remoteCallResponse.hasHookErrors ||
            remoteCallResponse.hasOtherErrors ||
            remoteCallResponse.hasPersistedErrors;
    }

    addMissingPersistedHookParams(): string[] {
        const remoteRoute = this.remoteMethodsById.get(this.routeId);
        if (!remoteRoute) throw new Error(`Remote route ${this.routeId} not found.`);
        const hookPointerIds = remoteRoute.executionPathIds.filter((id) => !!id && this.routeId !== id);

        const missingPersistedIds: string[] = [];

        hookPointerIds.forEach((id) => {
            const currentParams = this.requestBody[id];
            if (currentParams) return;
            const storageKey = this.getLocalStorageKey(id);
            const persistedParams = localStorage.getItem(storageKey);
            if (!persistedParams) return;
            try {
                const params = JSON.parse(persistedParams);
                this.requestBody[id] = params;
            } catch (e) {
                localStorage.removeItem(storageKey);
            } finally {
                missingPersistedIds.push(id);
            }
        });

        return missingPersistedIds;
    }

    serializeRequestBody(response: RemoteCallResponse<any, any>): void {
        if (!this.options.enableSerialization) return;
        Object.entries(this.requestBody).forEach(([key, params]) => {
            const remoteMethod = this.remoteMethodsById.get(key);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
            const serialized = serializeParameters(params, remoteMethod, this.reflectionById.get(remoteMethod.id));
            response[key] = serialized;
        });
    }

    validateRequestBody(response: RemoteCallResponse<any, any>): void {
        if (!this.options.enableValidation) return;
        Object.entries(this.requestBody).forEach(([key, params]) => {
            const remoteMethod = this.remoteMethodsById.get(key);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
            response[key] = validateParameters(params, remoteMethod, this.reflectionById.get(remoteMethod.id));
        });
    }

    deserializeResponseBody(responseBody: ResolvedPublicResponses): ResolvedPublicResponses {
        const deSerializedBody = responseBody;
        Object.entries(deSerializedBody).forEach(([key, remoteHandlerResponse]) => {
            const remoteMethod = this.remoteMethodsById.get(key);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${key} not found.`);
            const deSerialized = deSerializeReturn(remoteHandlerResponse, remoteMethod, this.reflectionById.get(remoteMethod.id));
            deSerializedBody[key] = deSerialized;
        });
        return deSerializedBody;
    }

    async fetchRemoteMethodsInfo(paths: string[]) {
        this.restoreRemoteMethodsFromLocalStorage(paths);
        const missingAfterLocal = paths.filter((path) => !this.remoteMethodsById.has(path));
        if (!missingAfterLocal.length) return;
        const body: RequestBody = {
            [GET_PUBLIC_METHODS_ID]: [missingAfterLocal],
        };
        try {
            const url = new URL(GET_PUBLIC_METHODS_ID, this.options.baseURL);
            const response = await fetch(url, {
                method: 'PUT',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify(body),
            });
            const respObj = await response.json();
            const resp = respObj[GET_PUBLIC_METHODS_ID] as ResolvedResponse<{[key: string]: RemoteMethod}>;
            // TODO: convert Public error into a class that extends error and throw as an error
            if (isPublicError(resp)) throw new PublicError(resp);
            if (!resp) throw new Error('No remote methods found in response');

            Object.entries(resp).forEach(([path, remoteMethod]: [string, RemoteMethod]) => {
                this.setRemoteMethodMetadata(path, remoteMethod);
            });
        } catch (error: any) {
            throw new Error(`Error fetching validation and serialization metadata: ${error?.message}`);
        }
    }

    restoreRemoteMethodsFromLocalStorage(paths: string[]) {
        return paths.map((path) => {
            const storageKey = this.getLocalStorageKey(path);
            const remoteMethodJson = localStorage.getItem(storageKey);
            if (!remoteMethodJson) return;
            try {
                const remoteMethod = JSON.parse(remoteMethodJson);
                this.setRemoteMethodMetadata(path, remoteMethod, false);
            } catch (e) {
                localStorage.removeItem(storageKey);
                return;
            }
        });
    }

    getLocalStorageKey(id: string) {
        return `${STORAGE_KEY}:remote-methods:${id}`;
    }

    setRemoteMethodMetadata(id: string, method: RemoteMethod, store = true) {
        const methodWithPathIds = {
            ...method,
            executionPathIds: method.executionPathPointers?.map((pointer) => getRouterItemId(pointer)) || [],
        };
        this.remoteMethodsById.set(id, methodWithPathIds);
        this.reflectionById.set(id, this.getFunctionReflection(method.handlerSerializedType));
        if (store) localStorage.setItem(this.getLocalStorageKey(id), JSON.stringify(method));
    }

    getFunctionReflection(serializedTypes: SerializedTypes): FunctionReflection {
        const type = getDeserializedFunctionType(serializedTypes);
        return getFunctionReflectionMethods(type, this.options.reflectionOptions, 0);
    }
}
