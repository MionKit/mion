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
    RemoteMethodsById,
    RequestBody,
    RequestHeaders,
    RouteSubRequest,
    SerializeErrors,
} from './types';
import {ParamsValidationResponse} from '@mionkit/runtype';
import {PublicError, StatusCodes, getRoutePath, isPublicError} from '@mionkit/core';
import {STORAGE_KEY} from './constants';
import {fetchRemoteMethodsInfo} from './remoteMethodsInfo';
import {deserializeResponseBody, serializeSubRequests, validateSubRequests} from './reflection';

export class MionRequest<RR extends RouteSubRequest<any>, HookRequestsList extends HookSubRequest<any>[]> {
    readonly path: string;
    readonly requestId: string;
    readonly subRequests: {[key: string]: SubRequest<any>} = {};
    response: Response | undefined;
    rawResponseBody: ResolvedPublicResponses | undefined;
    constructor(
        public readonly options: ClientOptions,
        public readonly remoteMethodsById: RemoteMethodsById,
        public readonly reflectionById: ReflectionById,
        public readonly route?: RR,
        public readonly hooks?: HookRequestsList
    ) {
        this.path = route ? getRoutePath(route.pointer, this.options) : 'no-route';
        this.requestId = route ? route.id : 'no-route';
        if (route) this.addSubRequest(route);
        if (hooks) hooks.forEach((hook) => this.addSubRequest(hook));
    }

    async run(): Promise<ResolvedPublicResponses> {
        await this.prepareRequest();
        await this.executeRequest();
        return this.parseResponse();
    }

    async validateParams(subRequests?: SubRequest<any>[]): Promise<ParamsValidationResponse[]> {
        if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsInfo(subRequestIds, this.options, this.remoteMethodsById, this.reflectionById);
            const validateErrors = validateSubRequests(subRequestIds, this, {}, false);
            if (Object.keys(validateErrors).length) return Promise.reject(validateErrors);
            return Object.values(this.subRequests).map((subRequest) => subRequest.validationResponse as ParamsValidationResponse);
        } catch (error: any) {
            return this.rejectRequest(error, 'Error preparing request');
        }
    }

    async persist(subRequests?: SubRequest<any>[]): Promise<void> {
        if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsInfo(subRequestIds, this.options, this.remoteMethodsById, this.reflectionById);
            const validateErrors = validateSubRequests(subRequestIds, this, {}, false);
            if (Object.keys(validateErrors).length) return Promise.reject(validateErrors);
            const persistErrors = this.persistedSubRequest();
            if (Object.keys(persistErrors).length) return Promise.reject(persistErrors);
            return;
        } catch (error: any) {
            return this.rejectRequest(error, 'Error preparing request');
        }
    }

    addSubRequest(subRequest: SubRequest<any>) {
        if (subRequest.isResolved) throw new Error(`SubRequest ${subRequest.id} is already resolved`);
        this.subRequests[subRequest.id] = subRequest;
    }

    // ############# PRIVATE METHODS REQUEST #############

    private async prepareRequest(): Promise<never | void> {
        try {
            const subRequestIds = Object.keys(this.subRequests);
            await fetchRemoteMethodsInfo(subRequestIds, this.options, this.remoteMethodsById, this.reflectionById);
            this.restorePersistedSubRequest();

            const validateErrors = validateSubRequests(subRequestIds, this);
            if (Object.keys(validateErrors).length) return Promise.reject(validateErrors);
            const serializeErrors = serializeSubRequests(subRequestIds, this);
            if (Object.keys(serializeErrors).length) return Promise.reject(serializeErrors);
        } catch (error: any) {
            return this.rejectRequest(error, 'Error preparing request');
        }
    }

    private async executeRequest(): Promise<never | void> {
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
            return this.rejectRequest(error, 'Error executing request');
        }
    }

    private parseResponse(): Promise<never> | ResolvedPublicResponses {
        try {
            let hasErrors = false;
            const deserialized = deserializeResponseBody(this.rawResponseBody as ResolvedPublicResponses, this);
            Object.entries(this.subRequests).forEach(([id, remoteMethod]) => {
                const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
                remoteMethod.isResolved = true;
                if (isPublicError(resp)) {
                    remoteMethod.error = resp;
                    hasErrors = true;
                } else {
                    remoteMethod.return = resp;
                }
            });

            if (hasErrors) return Promise.reject(deserialized);
            return deserialized;
        } catch (error) {
            return this.rejectRequest(error, 'Error parsing response');
        }
    }

    private rejectRequest(error: any, stageMessage: string) {
        const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
        return Promise.reject({
            [this.requestId]: new PublicError({
                statusCode: StatusCodes.BAD_REQUEST,
                name: 'Request Error',
                message,
            }),
        });
    }

    private getRequestData() {
        const headers: RequestHeaders = {};
        const body: RequestBody = {};
        Object.values(this.subRequests).forEach((subRequest) => {
            const remoteMethod = this.remoteMethodsById.get(subRequest.id);
            if (!subRequest.serializedParams) throw new Error(`SubRequest ${subRequest.id} is not serialized.`);
            if (!remoteMethod) throw new Error(`Metadata for remote method ${subRequest.id} not found.`);
            if (remoteMethod.inHeader && remoteMethod.headerName) {
                const value = subRequest.serializedParams[0];
                // TODO: we might need to use the native Header object instead JSON.stringify
                headers[remoteMethod.headerName] = JSON.stringify(value);
            } else {
                body[subRequest.id] = subRequest.serializedParams;
            }
        });
        return {headers, body};
    }

    private getResponseValueFromBodyOrHeader(id: string, respBody: ResolvedPublicResponses, headers: Headers): any {
        const remoteMethod = this.remoteMethodsById.get(id);
        if (remoteMethod && remoteMethod.inHeader && remoteMethod.headerName) {
            return headers.get(remoteMethod.headerName);
        }
        return respBody[id];
    }

    private restorePersistedSubRequest() {
        const remoteRoute = this.remoteMethodsById.get(this.requestId);
        if (!remoteRoute) throw new Error(`Remote route ${this.requestId} not found.`);
        const missingIds = remoteRoute.hookIds?.filter((id) => !!id && this.requestId !== id) || [];
        missingIds.forEach((id) => {
            const subRequest = this.subRequests[id];
            if (subRequest) return;
            const storageKey = this.getSubRequestStorageKey(id);
            const persistedValue = localStorage.getItem(storageKey);
            if (!persistedValue) return;
            try {
                const restoredSubRequest = JSON.parse(persistedValue);
                this.addSubRequest(restoredSubRequest);
            } catch (e) {
                localStorage.removeItem(storageKey);
                throw new Error(`Error reading persisted request ${id}.`);
            }
        });
    }

    private persistedSubRequest(): SerializeErrors {
        const errors: SerializeErrors = {};
        Object.keys(this.subRequests).forEach((id) => {
            const subRequest = this.subRequests[id];
            const remoteMethod = this.remoteMethodsById.get(id);
            if (!remoteMethod) throw new Error(`Remote method ${id} not found.`);
            if (remoteMethod.isRoute) {
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
                errors[id] = new PublicError({
                    statusCode: StatusCodes.BAD_REQUEST,
                    name: 'Persist Error',
                    message: `Error persisting request ${id}.`,
                });
            }
        });
        return errors;
    }

    private getSubRequestStorageKey(id: string) {
        return `${STORAGE_KEY}:remote-request-preset:${this.options.baseURL}:x${id}`;
    }
}
