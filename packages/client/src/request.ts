/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionkit/router';
import {ClientOptions, HookSubRequest, SubRequest, RouteSubRequest, RequestErrors} from './types';
import type {RunTypeError} from '@mionkit/core';
import {RpcError, isRpcError, HandlerType, routesCache, MION_ROUTES} from '@mionkit/core';
import {getRoutePath} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {fetchRemoteMethodsMetadata} from './clientMethodsMetadata';
import {validateSubRequests} from './validation';
import {serializeRequestBody, deserializeResponseBody} from './serializer';

export class MionRequest<RR extends RouteSubRequest<any>, HookRequestsList extends HookSubRequest<any>[]> {
    readonly path: string;
    readonly requestId: string;
    readonly subRequestList: {[key: string]: SubRequest<any>} = {};
    response: Response | undefined;
    constructor(
        public readonly options: ClientOptions,
        public readonly route?: RR,
        public readonly hooks?: HookRequestsList
    ) {
        this.path = route ? getRoutePath(route.pointer, this.options) : 'no-route';
        this.requestId = route ? route.id : 'no-route';
        if (route) this.addSubRequest(route);
        if (hooks) hooks.forEach((hook) => this.addSubRequest(hook));
    }

    /**  Calls a remote route. If anythings fails or remote route returns an error then throws a RequestErrors Map */
    async call(): Promise<ResponseBody> {
        const errors: RequestErrors = new Map();

        // prepare and validate full request with the route and all hooks
        try {
            const subRequestIds = Object.keys(this.subRequestList);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options);

            this.restorePersistedSubRequest(errors);
            if (errors.size) return Promise.reject(errors);

            validateSubRequests(subRequestIds, this, errors);
            if (errors.size) return Promise.reject(errors);
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }

        // make the request
        try {
            const body = serializeRequestBody(this);

            const url = new URL(this.path, this.options.baseURL);
            const fetchOptions: RequestInit = {
                ...this.options.fetchOptions,
                headers: {
                    ...this.options.fetchOptions.headers,
                    // TODO: set headers from hook headers
                },
                body: body,
            };
            this.response = await fetch(url, fetchOptions);
        } catch (error: any) {
            this.onError(error, 'Error executing request', errors);
            return Promise.reject(errors);
        }

        // deserialize response
        try {
            // if there are any errors they are part of the deserialized body
            const deserialized = await deserializeResponseBody(this.response);

            // Check if this is a global error response
            // Global errors occur when the request failed before reaching the router
            // They are extracted from unexpectedErrors by the deserializer
            if (MION_ROUTES.globalError in deserialized) {
                const globalError = deserialized[MION_ROUTES.globalError];
                // Apply the global error to all subrequests
                Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
                    methodMeta.isResolved = true;
                    methodMeta.error = globalError as RpcError<string>;
                    errors.set(id, globalError as RpcError<string>);
                });
                return Promise.reject(errors);
            }

            // Unexpected errors are already merged into deserialized by the deserializer

            Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
                const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
                methodMeta.isResolved = true;
                if (isRpcError(resp)) {
                    methodMeta.error = resp;
                    errors.set(id, resp);
                } else {
                    methodMeta.result = resp;
                }
            });

            if (errors.size) return Promise.reject(errors);
            return deserialized;
        } catch (error) {
            this.onError(error, 'Error parsing response', errors);
            return Promise.reject(errors);
        }
    }

    /**  Validate params. If can't run validation then throws a RequestErrors Map */
    async validateParams(subReqList?: SubRequest<any>[]): Promise<RunTypeError[]> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequestList);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options);

            validateSubRequests(subRequestIds, this, errors, false);
            if (errors.size) return Promise.reject(errors);

            return Object.values(this.subRequestList)
                .map((subRequest) => subRequest.error?.errorData || [])
                .flat();
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }
    }

    /**  Prefills and stores SubRequest. If validation, serialization or cant store then throws a RequestErrors Map */
    async prefill(subReqList?: SubRequest<any>[]): Promise<void> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequestList);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options);

            validateSubRequests(subRequestIds, this, errors, false);
            if (errors.size) return Promise.reject(errors);

            serializeRequestBody(this);

            this.persistedSubRequest(errors);
            if (errors.size) return Promise.reject(errors);

            return;
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }
    }

    // this method does not need to be async, is only so it has the same signature as the rest of methods
    /**  Removes Prefills and stores SubRequest. If there is an error the throws RequestErrors Map */
    async removePrefill(subRequests?: SubRequest<any>[]): Promise<void> {
        if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));

        const errors: RequestErrors = new Map();
        this.removePersistedSubRequest(errors);
        if (errors.size) return Promise.reject(errors);
    }

    addSubRequest(subRequest: SubRequest<any>) {
        if (subRequest.isResolved) {
            throw new Error(`SubRequest ${subRequest.id} is already resolved`);
        }
        this.subRequestList[subRequest.id] = subRequest;
    }

    // ############# PRIVATE METHODS #############

    private onError(error: any, stageMessage: string, errors: RequestErrors): void {
        const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
        errors.set(
            this.requestId,
            new RpcError({
                type: error.name || 'unknown-error',
                publicMessage: message,
            })
        );
    }

    private getResponseValueFromBodyOrHeader(id: string, respBody: ResponseBody, headers: Headers): any {
        const methodMeta = routesCache.getMetadata(id);
        if (
            methodMeta &&
            methodMeta.type === HandlerType.headerHook &&
            methodMeta.headersParam?.headerNames &&
            methodMeta.headersParam?.headerNames.length > 0
        ) {
            return headers.get(methodMeta.headersParam.headerNames[0]);
        }
        return respBody[id];
    }

    // subRequests must be already validated and serialized (so only valid requests are stored)
    private restorePersistedSubRequest(errors: RequestErrors): void {
        const methodMeta = routesCache.getMetadata(this.requestId);
        if (!methodMeta) {
            errors.set(
                this.requestId,
                new RpcError({
                    type: 'route-metadata-not-found',
                    publicMessage: `Metadata for Route '${this.requestId} not found.'.`,
                })
            );
            return;
        }
        const missingIds = methodMeta.hookIds?.filter((id) => !!id && this.requestId !== id) || [];
        missingIds.forEach((id) => {
            const subRequest = this.subRequestList[id];
            if (subRequest) return;
            const storageKey = this.getSubRequestStorageKey(id);
            const jsonValue = localStorage.getItem(storageKey);
            if (!jsonValue) return;
            try {
                const restoredSubRequest = JSON.parse(jsonValue);
                this.addSubRequest(restoredSubRequest);
            } catch (err: any) {
                localStorage.removeItem(storageKey);
                errors.set(
                    id,
                    new RpcError({
                        type: 'reading-persisted-request-from-storage',
                        publicMessage: `Error reading persisted request ${id}: ${err?.message}`,
                    })
                );
            }
        });
        return;
    }

    private persistedSubRequest(errors: RequestErrors): void {
        Object.keys(this.subRequestList).forEach((id) => {
            const subRequest = this.subRequestList[id];
            const methodMeta = routesCache.getMetadata(id);
            if (!methodMeta) throw new Error(`Remote method ${id} not found.`);
            if (methodMeta.type === HandlerType.route) {
                errors[id] = new RpcError({
                    type: 'routes-cant-be-persisted',
                    publicMessage: `Remote method ${id} is a route and can't be persisted.`,
                });
                return;
            }
            const storageKey = this.getSubRequestStorageKey(id);
            try {
                const jsonSubRequest = JSON.stringify(subRequest);
                localStorage.setItem(storageKey, jsonSubRequest);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                localStorage.removeItem(storageKey);
                errors.set(
                    id,
                    new RpcError({
                        type: 'adding-persisting-request-to-storage',
                        publicMessage: `Error persisting request ${id}.`,
                    })
                );
            }
        });
        return;
    }

    private removePersistedSubRequest(errors: RequestErrors): void {
        Object.keys(this.subRequestList).forEach((id) => {
            try {
                const storageKey = this.getSubRequestStorageKey(id);
                localStorage.removeItem(storageKey);
                // eslint-disable-next-line @typescript-eslint/no-unused-vars
            } catch (e) {
                errors.set(
                    id,
                    new RpcError({
                        type: 'removing-persisted-request-from-storage',
                        publicMessage: `Error removing persisted request ${id}.`,
                    })
                );
            }
        });
        return;
    }

    private getSubRequestStorageKey(id: string) {
        return `${STORAGE_KEY}:remote-request-preset:${this.options.baseURL}:x${id}`;
    }
}
