/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResolvedPublicResponses} from '@mionkit/router';
import {
    ClientOptions,
    HookSubRequest,
    SubRequest,
    ReflectionById,
    MetadataById,
    RequestBody,
    RequestHeaders,
    RouteSubRequest,
    RequestErrors,
} from './types';
import {ParamsValidationResponse} from '@mionkit/runtype';
import {PublicError, StatusCodes, getRoutePath, isPublicError} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {fetchRemoteMethodsMetadata} from './clientMethodsMetadata';
import {deserializeResponseBody, serializeSubRequests, validateSubRequests} from './reflection';

export class MionRequest<RR extends RouteSubRequest<any>, HookRequestsList extends HookSubRequest<any>[]> {
    readonly path: string;
    readonly requestId: string;
    readonly subRequests: {[key: string]: SubRequest<any>} = {};
    response: Response | undefined;
    rawResponseBody: ResolvedPublicResponses | undefined;
    constructor(
        public readonly options: ClientOptions,
        public readonly metadataById: MetadataById,
        public readonly reflectionById: ReflectionById,
        public readonly route?: RR,
        public readonly hooks?: HookRequestsList
    ) {
        this.path = route ? getRoutePath(route.pointer, this.options) : 'no-route';
        this.requestId = route ? route.id : 'no-route';
        if (route) this.addSubRequest(route);
        if (hooks) hooks.forEach((hook) => this.addSubRequest(hook));
    }

    /**  Calls a remote route. If anythings fails or remote route returns an error then throws a RequestErrors Map */
    async call(): Promise<ResolvedPublicResponses> {
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            this.restorePersistedSubRequest(errors);
            if (errors.size) return Promise.reject(errors);

            validateSubRequests(subRequestIds, this, errors);
            if (errors.size) return Promise.reject(errors);

            serializeSubRequests(subRequestIds, this, errors);
            if (errors.size) return Promise.reject(errors);
        } catch (error: any) {
            this.routeError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }

        try {
            const {headers, body} = this.getRequestData();
            const url = new URL(this.path, this.options.baseURL);
            const fetchOptions: RequestInit = {
                ...this.options.fetchOptions,
                headers: {
                    ...this.options.fetchOptions.headers,
                    ...headers,
                    // TODO: set headers from hook headers
                },
                body: JSON.stringify(body),
            };
            this.response = await fetch(url, fetchOptions);
            this.rawResponseBody = await this.response.json();
        } catch (error: any) {
            this.routeError(error, 'Error executing request', errors);
            return Promise.reject(errors);
        }

        try {
            // if there are any errors they are part of the deserialized body
            const deserialized = deserializeResponseBody(this.rawResponseBody as ResolvedPublicResponses, this);
            Object.entries(this.subRequests).forEach(([id, methodMeta]) => {
                const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
                methodMeta.isResolved = true;
                if (isPublicError(resp)) {
                    methodMeta.error = resp;
                    errors.set(id, resp);
                } else {
                    methodMeta.return = resp;
                }
            });

            if (errors.size) return Promise.reject(errors);
            return deserialized;
        } catch (error) {
            this.routeError(error, 'Error parsing response', errors);
            return Promise.reject(errors);
        }
    }

    /**  Validate params. If can't run validation then throws a RequestErrors Map */
    async validateParams(subReqList?: SubRequest<any>[]): Promise<ParamsValidationResponse[]> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            validateSubRequests(subRequestIds, this, errors, false);
            if (errors.size) return Promise.reject(errors);

            return Object.values(this.subRequests).map((subRequest) => subRequest.validationResponse as ParamsValidationResponse);
        } catch (error: any) {
            this.routeError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }
    }

    /**  Prefills and stores SubRequest. If validation, serialization or cant store then throws a RequestErrors Map */
    async prefill(subReqList?: SubRequest<any>[]): Promise<void> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            validateSubRequests(subRequestIds, this, errors, false);
            if (errors.size) return Promise.reject(errors);

            serializeSubRequests(subRequestIds, this, errors);
            if (errors.size) return Promise.reject(errors);

            this.persistedSubRequest(errors);
            if (errors.size) return Promise.reject(errors);

            return;
        } catch (error: any) {
            this.routeError(error, 'Error preparing request', errors);
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
        this.subRequests[subRequest.id] = subRequest;
    }

    // ############# PRIVATE METHODS #############

    private routeError(error: any, stageMessage: string, errors: RequestErrors): void {
        const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
        errors.set(
            this.requestId,
            new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: error.name || 'Unknown Error',
                message,
            })
        );
    }

    private getRequestData() {
        const headers: RequestHeaders = {};
        const body: RequestBody = {};
        Object.values(this.subRequests).forEach((subRequest) => {
            const methodMeta = this.metadataById.get(subRequest.id);
            if (!subRequest.serializedParams) throw new Error(`SubRequest ${subRequest.id} is not serialized.`);
            if (!methodMeta) throw new Error(`Metadata for remote method ${subRequest.id} not found.`);
            if (methodMeta.inHeader && methodMeta.headerName) {
                // TODO: check if we using soft serialization in the client
                headers[methodMeta.headerName] = subRequest.serializedParams[0];
            } else {
                body[subRequest.id] = subRequest.serializedParams;
            }
        });
        return {headers, body};
    }

    private getResponseValueFromBodyOrHeader(id: string, respBody: ResolvedPublicResponses, headers: Headers): any {
        const methodMeta = this.metadataById.get(id);
        if (methodMeta && methodMeta.inHeader && methodMeta.headerName) {
            return headers.get(methodMeta.headerName);
        }
        return respBody[id];
    }

    // subRequests must be already validated and serialized (so only valid requests are stored)
    private restorePersistedSubRequest(errors: RequestErrors): void {
        const remoteRoute = this.metadataById.get(this.requestId);
        if (!remoteRoute) {
            errors.set(
                this.requestId,
                new PublicError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Request Error',
                    message: `Metadata for Route '${this.requestId} not found.'.`,
                })
            );
            return;
        }
        const missingIds = remoteRoute.hookIds?.filter((id) => !!id && this.requestId !== id) || [];
        missingIds.forEach((id) => {
            const subRequest = this.subRequests[id];
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
                    new PublicError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        name: 'Persist Error',
                        message: `Error reading persisted request ${id}: ${err?.message}`,
                    })
                );
            }
        });
        return;
    }

    private persistedSubRequest(errors: RequestErrors): void {
        Object.keys(this.subRequests).forEach((id) => {
            const subRequest = this.subRequests[id];
            const methodMeta = this.metadataById.get(id);
            if (!methodMeta) throw new Error(`Remote method ${id} not found.`);
            if (methodMeta.isRoute) {
                errors[id] = new PublicError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Persist Error',
                    message: `Remote method ${id} is a route and can't be persisted.`,
                });
                return;
            }
            const storageKey = this.getSubRequestStorageKey(id);
            try {
                const jsonSubRequest = JSON.stringify(subRequest);
                localStorage.setItem(storageKey, jsonSubRequest);
            } catch (e) {
                localStorage.removeItem(storageKey);
                errors.set(
                    id,
                    new PublicError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        name: 'Persist Error',
                        message: `Error persisting request ${id}.`,
                    })
                );
            }
        });
        return;
    }

    private removePersistedSubRequest(errors: RequestErrors): void {
        Object.keys(this.subRequests).forEach((id) => {
            try {
                const storageKey = this.getSubRequestStorageKey(id);
                localStorage.removeItem(storageKey);
            } catch (e) {
                errors.set(
                    id,
                    new PublicError({
                        statusCode: StatusCodes.BAD_REQUEST,
                        name: 'Persist Error',
                        message: `Error removing persisted request ${id}.`,
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
