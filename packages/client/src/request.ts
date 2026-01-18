/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionkit/router';
import {ClientOptions, HSubRequest, SubRequest, RSubRequest, RequestErrors, PrefilledHooksCache} from './types';
import type {RunTypeError} from '@mionkit/core';
import {RpcError, isRpcError, routesCache, MION_ROUTES, HandlerType, HeadersSubset} from '@mionkit/core';
import {getRoutePath} from '@mionkit/core';
import {fetchRemoteMethodsMetadata} from './clientMethodsMetadata';
import {validateSubRequests} from './validation';
import {serializeRequestBody, deserializeResponseBody} from './serializer';

export class MionClientRequest<RR extends RSubRequest<any>, HookRequestsList extends HSubRequest<any>[]> {
    readonly path: string;
    readonly requestId: string;
    readonly subRequestList: {[key: string]: SubRequest<any>} = {};
    response: Response | undefined;
    constructor(
        public readonly options: ClientOptions,
        private readonly prefilledHooksCache: PrefilledHooksCache,
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

            this.restorePrefilledHooks(errors);
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
            const headersFromParams = extractRequestHeaders(this);

            const url = new URL(this.path, this.options.baseURL);
            const fetchOptions: RequestInit = {
                ...this.options.fetchOptions,
                headers: {
                    ...this.options.fetchOptions.headers,
                    // Headers extracted from HeadersSubset params in headersHooks
                    ...headersFromParams,
                },
                body,
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

            // Check if this is a platform error response
            // Global errors occur when the request failed before reaching the router
            // They are extracted from unexpectedErrors by the deserializer
            if (MION_ROUTES.platformError in deserialized) {
                const platformError = deserialized[MION_ROUTES.platformError];
                // Apply the platform error to all subrequests
                Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
                    methodMeta.isResolved = true;
                    methodMeta.error = platformError as RpcError<string>;
                    errors.set(id, platformError as RpcError<string>);
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
                    methodMeta.resolvedValue = resp;
                }
            });

            // Check for errors on methods NOT in subRequestList (e.g., required hooks that weren't sent)
            // These errors occur when server-side hooks fail but weren't explicitly requested by client
            Object.entries(deserialized).forEach(([id, value]) => {
                if (!(id in this.subRequestList) && isRpcError(value)) {
                    errors.set(id, value);
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

            // Validate and collect errors in subRequest.error (don't reject on validation errors)
            validateSubRequests(subRequestIds, this, errors, false);

            // Return all validation errors (RunTypeError[]) from subRequest.error.errorData
            // Note: validation errors are returned as data, not rejected - only unexpected errors reject
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

            this.storePrefilledHooks(errors);
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

        this.removePrefilledHooks();
    }

    addSubRequest(subRequest: SubRequest<any>) {
        if (subRequest.isResolved) {
            throw new Error(`SubRequest ${subRequest.id} is already resolved`);
        }
        this.subRequestList[subRequest.id] = subRequest;
    }

    // ############# PRIVATE METHODS #############

    private onError(error: any, stageMessage: string, errors: RequestErrors): void {
        if (isRpcError(error)) {
            errors.set(this.requestId, error);
            return;
        }
        const message = error?.message ? `${stageMessage}: ${error.message}` : `${stageMessage}: Unknown Error`;
        errors.set(
            this.requestId,
            new RpcError({
                type: error?.name || 'unknown-error',
                publicMessage: message,
                // Preserve the original error for debugging and proper error chaining
                originalError: error instanceof Error ? error : undefined,
            })
        );
    }

    private getResponseValueFromBodyOrHeader(id: string, respBody: ResponseBody, headers: Headers): any {
        // Check if method has headersReturn and reconstruct HeadersSubset from response headers
        const headersSubset = reconstructHeadersSubsetFromResponse(id, headers);
        if (headersSubset) {
            return headersSubset;
        }
        return respBody[id];
    }

    // Restore prefilled hooks from in-memory cache
    private restorePrefilledHooks(errors: RequestErrors): void {
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
            const cacheKey = this.getPrefilledHookCacheKey(id);
            const cachedSubRequest = this.prefilledHooksCache.get(cacheKey);
            if (cachedSubRequest) {
                // Clone the subRequest to avoid mutating the cached version
                // (each request needs its own isResolved state)
                const clonedSubRequest: SubRequest<any> = {
                    ...cachedSubRequest,
                    isResolved: false,
                    resolvedValue: undefined,
                    error: undefined,
                };
                this.addSubRequest(clonedSubRequest);
            }
        });
    }

    // Store prefilled hooks in in-memory cache
    private storePrefilledHooks(errors: RequestErrors): void {
        Object.keys(this.subRequestList).forEach((id) => {
            const subRequest = this.subRequestList[id];
            const methodMeta = routesCache.getMetadata(id);
            if (!methodMeta) throw new Error(`Remote method ${id} not found.`);
            if (methodMeta.type === HandlerType.route) {
                errors.set(
                    id,
                    new RpcError({
                        type: 'routes-cant-be-prefilled',
                        publicMessage: `Remote method ${id} is a route and can't be prefilled.`,
                    })
                );
                return;
            }
            const cacheKey = this.getPrefilledHookCacheKey(id);
            this.prefilledHooksCache.set(cacheKey, subRequest);
        });
    }

    // Remove prefilled hooks from in-memory cache
    private removePrefilledHooks(): void {
        Object.keys(this.subRequestList).forEach((id) => {
            const cacheKey = this.getPrefilledHookCacheKey(id);
            this.prefilledHooksCache.delete(cacheKey);
        });
    }

    private getPrefilledHookCacheKey(id: string): string {
        return `${this.options.baseURL}:${id}`;
    }
}

// ############# HELPER FUNCTIONS #############

/**
 * Extracts headers from HeadersSubset params in headersHook methods.
 * This mirrors how the router extracts headers in runHeaderHook (dispatch.ts).
 *
 * For headersHook methods, the first param (after context) is the HeadersSubset.
 * This function extracts those header values to be sent as HTTP headers.
 *
 * @returns Record of header names to values
 */
function extractRequestHeaders(req: MionClientRequest<any, any>): Record<string, string> {
    const headers: Record<string, string> = {};
    const subRequestIds = Object.keys(req.subRequestList);

    for (let i = 0; i < subRequestIds.length; i++) {
        const id = subRequestIds[i];
        const subRequest = req.subRequestList[id];
        if (!subRequest) continue;

        const method = routesCache.getMetadata(id);
        if (!method || method.type !== HandlerType.headerHook || !method.headersParam) continue;

        const params = subRequest.params;
        const extracted = extractHeadersFromParams(params);
        Object.assign(headers, extracted);
    }

    return headers;
}

/**
 * Extracts headers from a HeadersSubset parameter.
 * The first param must be a HeadersSubset instance or an object with 'headers' property.
 * This mirrors how the router extracts headers in runHeaderHook (dispatch.ts).
 *
 * @param params The params array from the subRequest
 * @returns The headers record from the HeadersSubset
 */
function extractHeadersFromParams(params: any[]): Record<string, string> {
    if (!params || params.length === 0) {
        throw new RpcError({
            type: 'missing-headers-param',
            publicMessage: 'HeadersHook requires a HeadersSubset parameter.',
        });
    }

    const firstParam = params[0];

    // Check for HeadersSubset instance OR duck-typed object with headers property
    if (firstParam instanceof HeadersSubset) {
        return firstParam.headers as Record<string, string>;
    }

    // Duck type check: object with headers property that is an object
    if (firstParam && typeof firstParam === 'object' && 'headers' in firstParam && typeof firstParam.headers === 'object') {
        return firstParam.headers as Record<string, string>;
    }

    throw new RpcError({
        type: 'invalid-headers-param',
        publicMessage: 'HeadersHook first parameter must be a HeadersSubset instance or object with headers property.',
    });
}

/**
 * Reconstructs a HeadersSubset from HTTP response headers for methods that return HeadersSubset.
 * When a hook or route returns HeadersSubset, the router sets those values as HTTP response headers
 * instead of including them in the body. This function reads those headers and creates a HeadersSubset.
 *
 * @param methodId The method ID to check for headersReturn
 * @param responseHeaders The HTTP response headers from fetch
 * @returns HeadersSubset if the method has headersReturn, undefined otherwise
 */
function reconstructHeadersSubsetFromResponse(
    methodId: string,
    responseHeaders: Headers
): HeadersSubset<string, string> | undefined {
    const method = routesCache.getMetadata(methodId);

    // Check if this method returns headers
    if (!method?.headersReturn?.headerNames || method.headersReturn.headerNames.length === 0) {
        return undefined;
    }

    const headerNames = method.headersReturn.headerNames;
    const headersMap: Record<string, string> = {};

    for (const name of headerNames) {
        const value = responseHeaders.get(name);
        if (value !== undefined && value !== null) {
            headersMap[name] = value;
        }
    }

    // Only return HeadersSubset if we found at least one header
    if (Object.keys(headersMap).length > 0) {
        return new HeadersSubset(headersMap);
    }

    return undefined;
}
