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
    SubRequestErrors,
} from './types';
import {ParamsValidationResponse} from '@mionkit/runtype';
import {PublicError, StatusCodes, getRoutePath, isPublicError} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {fetchRemoteMethodsMetadata} from './remoteMethodsInfo';
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

    async call(): Promise<ResolvedPublicResponses> {
        await this.prepareRequest();
        await this.executeRequest();
        return this.parseResponse();
    }

    async validateParams(subReqList?: SubRequest<any>[]): Promise<ParamsValidationResponse[]> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            const validateErrors = validateSubRequests(subRequestIds, this, new Map(), false);
            if (validateErrors.size) return Promise.reject(validateErrors);
            return Object.values(this.subRequests).map((subRequest) => subRequest.validationResponse as ParamsValidationResponse);
        } catch (error: any) {
            return Promise.reject(this.routeError(error, 'Error preparing request'));
        }
    }

    async prefill(subReqList?: SubRequest<any>[]): Promise<void> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            const validateErrors = validateSubRequests(subRequestIds, this, new Map(), false);
            if (validateErrors.size) return Promise.reject(validateErrors);

            const serializeErrors = serializeSubRequests(subRequestIds, this);
            if (serializeErrors.size) return Promise.reject(serializeErrors);

            const persistErrors = this.persistedSubRequest();
            if (persistErrors.size) return Promise.reject(persistErrors);
            return;
        } catch (error: any) {
            return Promise.reject(this.routeError(error, 'Error preparing request'));
        }
    }

    removePrefill(subRequests?: SubRequest<any>[]): SubRequestErrors {
        if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));
        return this.removePersistedSubRequest();
    }

    addSubRequest(subRequest: SubRequest<any>) {
        if (subRequest.isResolved) {
            throw new Error(`SubRequest ${subRequest.id} is already resolved`);
        }
        this.subRequests[subRequest.id] = subRequest;
    }

    // ############# PRIVATE METHODS REQUEST #############

    private async prepareRequest(): Promise<void> {
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.metadataById, this.reflectionById);

            const persistErrors = this.restorePersistedSubRequest();
            if (persistErrors.size) return Promise.reject(persistErrors);

            const validateErrors = validateSubRequests(subRequestIds, this);
            if (validateErrors.size) {
                return Promise.reject(validateErrors);
            }

            const serializeErrors = serializeSubRequests(subRequestIds, this);
            if (serializeErrors.size) return Promise.reject(serializeErrors);
        } catch (error: any) {
            return Promise.reject(this.routeError(error, 'Error preparing request'));
        }
    }

    private async executeRequest(): Promise<void> {
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
            return Promise.reject(this.routeError(error, 'Error executing request'));
        }
    }

    private parseResponse(): Promise<never> | ResolvedPublicResponses {
        try {
            let hasErrors = false;
            const deserialized = deserializeResponseBody(this.rawResponseBody as ResolvedPublicResponses, this);
            Object.entries(this.subRequests).forEach(([id, methodMeta]) => {
                const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
                methodMeta.isResolved = true;
                if (isPublicError(resp)) {
                    methodMeta.error = resp;
                    hasErrors = true;
                } else {
                    methodMeta.return = resp;
                }
            });

            if (hasErrors) return Promise.reject(deserialized);
            return deserialized;
        } catch (error) {
            return Promise.reject(this.routeError(error, 'Error parsing response'));
        }
    }

    private routeError(error: any, stageMessage: string): SubRequestErrors {
        const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
        const errors = new Map();
        errors.set(
            this.requestId,
            new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Request Error',
                message,
            })
        );
        return errors;
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
    private restorePersistedSubRequest(): SubRequestErrors {
        const errors: SubRequestErrors = new Map();
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
            return errors;
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
        return errors;
    }

    private persistedSubRequest(): SubRequestErrors {
        const errors: SubRequestErrors = new Map();
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
        return errors;
    }

    private removePersistedSubRequest(): SubRequestErrors {
        const errors: SubRequestErrors = new Map();
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
        return errors;
    }

    private getSubRequestStorageKey(id: string) {
        return `${STORAGE_KEY}:remote-request-preset:${this.options.baseURL}:x${id}`;
    }
}
