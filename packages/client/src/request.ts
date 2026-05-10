/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ResponseBody} from '@mionjs/router';
import {
    ClientOptions,
    MiddlewareSubRequest,
    SubRequest,
    RouteSubRequest,
    RequestErrors,
    PrefilledMiddleFnsCache,
} from './types.ts';
import type {RunTypeError, RoutesFlowQuery, RoutesFlowMapping} from '@mionjs/core';
import {RpcError, isRpcError, routesCache, MION_ROUTES, HandlerType, HeadersSubset, toBase64Url} from '@mionjs/core';
import type {SerializerMode} from '@mionjs/core';
import {getRoutePath} from '@mionjs/core';
import {fetchRemoteMethodsMetadata} from './lib/fetchRemoteMethodsMetadata.ts';
import {createMetadataSubRequest} from './lib/clientMethodsMetadata.ts';
import {validateSubRequests} from './lib/validation.ts';
import {serializeRequestBody, deserializeResponseBody} from './lib/serializer.ts';
import {ROUTES_FLOW_KEY, MAX_GET_URL_LENGTH} from './constants.ts';

export class MionClientRequest<RR extends RouteSubRequest<any>, MiddleFnRequestsList extends MiddlewareSubRequest<any>[]> {
    readonly path: string;
    readonly requestId: string;
    readonly subRequestList: {[key: string]: SubRequest<any>} = {};
    response: Response | undefined;

    constructor(
        public readonly options: ClientOptions,
        private readonly prefilledMiddleFnsCache: PrefilledMiddleFnsCache,
        public readonly route?: RR,
        public readonly middleFns?: MiddleFnRequestsList,
        /** Array of routesFlow subrequests when executing a routesFlow */
        public readonly workflowSubRequests?: RouteSubRequest<any>[],
        /** Composed abort signal for this request */
        public readonly signal?: AbortSignal
    ) {
        if (workflowSubRequests && workflowSubRequests.length > 0) {
            const routePaths = workflowSubRequests.map((sr) => getRoutePath(sr.pointer, this.options));
            const query = buildRoutesFlowQuery(routePaths, workflowSubRequests);
            const flowPath = getRoutePath([ROUTES_FLOW_KEY], this.options);
            this.path = `${flowPath}?data=${toBase64Url(JSON.stringify(query))}`;
            this.requestId = 'mion-routes-flow';
            workflowSubRequests.forEach((sr) => this.addSubRequest(sr));
        } else {
            this.path = route ? getRoutePath(route.pointer, this.options) : 'no-route';
            this.requestId = route ? route.id : 'no-route';
            if (route) this.addSubRequest(route);
        }
        if (middleFns) middleFns.forEach((middleFn) => this.addSubRequest(middleFn));
    }

    /** Calls a remote route */
    async call(): Promise<ResponseBody> {
        if (this.signal?.aborted) {
            const errors: RequestErrors = new Map();
            this.onError(
                this.signal.reason ?? new DOMException('This operation was aborted', 'AbortError'),
                'Request aborted',
                errors
            );
            return Promise.reject(errors);
        }
        return this.makeCall(this.options.serializer);
    }

    /** Call flow that auto-detects missing metadata and uses optimistic serialization when needed */
    private async makeCall(originalSerializer: SerializerMode, skipOptimistic?: boolean): Promise<ResponseBody> {
        const errors: RequestErrors = new Map();
        const subRequestIds = Object.keys(this.subRequestList);
        const allCached = subRequestIds.every((id) => routesCache.hasMetadata(id));
        const isOptimistic = !allCached && !skipOptimistic;

        try {
            if (isOptimistic) {
                (this.options as any).serializer = 'optimistic';
                this.restorePrefilledMiddleFns();
                // Add metadata subrequest (after prefilled restore so we include all IDs)
                const allSubRequestIds = Object.keys(this.subRequestList);
                this.addSubRequest(createMetadataSubRequest(allSubRequestIds));
            } else {
                (this.options as any).serializer = originalSerializer;
                await fetchRemoteMethodsMetadata(subRequestIds, this.options, this.signal);
                this.restorePrefilledMiddleFns(errors);
                if (errors.size) return Promise.reject(errors);
                validateSubRequests(subRequestIds, this, errors);
                if (errors.size) return Promise.reject(errors);
            }
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }

        try {
            let serialized: ReturnType<typeof serializeRequestBody>;
            try {
                serialized = serializeRequestBody(this);
            } catch (serializeError) {
                if (isOptimistic) {
                    // JSON.stringify failed → fall back to standard, will fetch metadata
                    delete this.subRequestList[MION_ROUTES.methodsMetadata];
                    return this.makeCall(originalSerializer, true);
                }
                throw serializeError;
            }

            const headersFromParams = extractRequestHeaders(this);
            const url = new URL(this.path, this.options.baseURL);
            const fetchOptions = buildFetchOptions(
                url,
                serialized,
                headersFromParams,
                this.options,
                isOptimistic,
                this.isQueryRoute(),
                this.signal
            );
            this.response = await fetch(url, fetchOptions);
        } catch (error: any) {
            this.onError(error, 'Error executing request', errors);
            return Promise.reject(errors);
        }

        try {
            // If the signal already aborted while fetch was in flight, don't try to read a possibly
            // truncated response body — surface the abort directly.
            if (this.signal?.aborted) {
                this.onError(this.signal.reason, 'Request aborted', errors);
                return Promise.reject(errors);
            }
            const deserialized = await deserializeResponseBody(this.response, this.options);
            if (this.handlePlatformError(deserialized, errors)) return Promise.reject(errors);

            // Never retry an aborted request — the user explicitly canceled it.
            if (isOptimistic && !this.signal?.aborted && this.shouldRetryWithProperSerialization(deserialized)) {
                return this.retryWithProperSerialization(originalSerializer);
            }

            this.resolveSubRequests(deserialized, errors, isOptimistic ? MION_ROUTES.methodsMetadata : undefined);
            if (errors.size) return Promise.reject(errors);
            return deserialized;
        } catch (error) {
            this.onError(error, 'Error parsing response', errors);
            return Promise.reject(errors);
        }
    }

    /** Checks if the response contains errors that require retry with proper JIT serialization */
    private shouldRetryWithProperSerialization(deserialized: ResponseBody): boolean {
        return Object.values(deserialized).some(
            (value) =>
                isRpcError(value) &&
                (value.type === 'serialization-error' ||
                    value.type === 'validation-error' ||
                    value.type === 'parsing-json-request-error')
        );
    }

    /** Retries the request with proper JIT serialization after metadata has been cached */
    private async retryWithProperSerialization(originalSerializer: SerializerMode): Promise<ResponseBody> {
        delete this.subRequestList[MION_ROUTES.methodsMetadata];
        Object.values(this.subRequestList).forEach((sr) => {
            sr.isResolved = false;
            sr.resolvedValue = undefined;
            sr.error = undefined;
        });
        return this.makeCall(originalSerializer);
    }

    /** Validate params */
    async validateParams(subReqList?: SubRequest<any>[]): Promise<RunTypeError[]> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequestList);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options);
            validateSubRequests(subRequestIds, this, errors, false);
            return Object.values(this.subRequestList)
                .map((subRequest) => subRequest.error?.errorData || [])
                .flat();
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }
    }

    /** Prefills and stores SubRequest */
    async prefill(subReqList?: SubRequest<any>[]): Promise<void> {
        if (subReqList) subReqList.forEach((subRequest) => this.addSubRequest(subRequest));
        const errors: RequestErrors = new Map();
        try {
            const subRequestIds = Object.keys(this.subRequestList);
            await fetchRemoteMethodsMetadata(subRequestIds, this.options);

            validateSubRequests(subRequestIds, this, errors, false);
            if (errors.size) return Promise.reject(errors);

            serializeRequestBody(this);

            this.storePrefilledMiddleFns(errors);
            if (errors.size) return Promise.reject(errors);

            return;
        } catch (error: any) {
            this.onError(error, 'Error preparing request', errors);
            return Promise.reject(errors);
        }
    }

    /** Removes Prefills and stores SubRequest */
    async removePrefill(subRequests?: SubRequest<any>[]): Promise<void> {
        if (subRequests) subRequests.forEach((subRequest) => this.addSubRequest(subRequest));
        this.removePrefilledMiddleFns();
    }

    addSubRequest(subRequest: SubRequest<any>) {
        if (subRequest.isResolved) throw new Error(`SubRequest ${subRequest.id} is already resolved`);
        this.subRequestList[subRequest.id] = subRequest;
    }

    /** Checks for platform-level errors and propagates them to all subrequests. Returns true if a platform error was found */
    private handlePlatformError(deserialized: ResponseBody, errors: RequestErrors): boolean {
        if (!(MION_ROUTES.platformError in deserialized)) return false;
        const platformError = deserialized[MION_ROUTES.platformError];
        Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
            methodMeta.isResolved = true;
            methodMeta.error = platformError as RpcError<string>;
            errors.set(id, platformError as RpcError<string>);
        });
        return true;
    }

    /** Resolves sub request values from the deserialized response body and collects errors */
    private resolveSubRequests(deserialized: ResponseBody, errors: RequestErrors, skipId?: string): void {
        Object.entries(this.subRequestList).forEach(([id, methodMeta]) => {
            if (id === skipId) return;
            const resp = this.getResponseValueFromBodyOrHeader(id, deserialized, (this.response as Response).headers);
            methodMeta.isResolved = true;
            if (isRpcError(resp)) {
                methodMeta.error = resp;
                errors.set(id, resp);
            } else {
                methodMeta.resolvedValue = resp;
            }
        });

        Object.entries(deserialized).forEach(([id, value]) => {
            if (!(id in this.subRequestList) && isRpcError(value)) {
                errors.set(id, value);
            }
        });
    }

    private onError(error: any, stageMessage: string, errors: RequestErrors): void {
        // Detect abort/timeout via signal.reason FIRST. We must do this before the isRpcError early return
        // because errors that surface from later stages (deserialization, retry, etc.) may already be
        // wrapped as RpcError but the user-facing reason is still abort/timeout.
        const reason = this.signal?.aborted ? this.signal.reason : undefined;
        if (reason instanceof DOMException) {
            if (reason.name === 'TimeoutError') {
                errors.set(
                    this.requestId,
                    new RpcError({
                        type: 'request-timeout',
                        publicMessage: 'Request timed out',
                        originalError: error instanceof Error ? error : undefined,
                    })
                );
                return;
            }
            if (reason.name === 'AbortError') {
                errors.set(
                    this.requestId,
                    new RpcError({
                        type: 'request-aborted',
                        publicMessage: 'Request was aborted',
                        originalError: error instanceof Error ? error : undefined,
                    })
                );
                return;
            }
        }
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
                originalError: error instanceof Error ? error : undefined,
            })
        );
    }

    private getResponseValueFromBodyOrHeader(id: string, respBody: ResponseBody, headers: Headers): any {
        const headersSubset = reconstructHeadersSubsetFromResponse(id, headers);
        if (headersSubset) return headersSubset;
        return respBody[id];
    }

    /** When errors is omitted, silently skips routes without cached metadata (used by optimistic flow) */
    private restorePrefilledMiddleFns(errors?: RequestErrors): void {
        if (this.workflowSubRequests && this.workflowSubRequests.length > 0) {
            this.restorePrefilledMiddleFnsForWorkflow(errors);
            return;
        }

        const methodMeta = routesCache.getMetadata(this.requestId);
        if (!methodMeta) {
            if (errors) {
                errors.set(
                    this.requestId,
                    new RpcError({
                        type: 'route-metadata-not-found',
                        publicMessage: `Metadata for Route '${this.requestId} not found.'.`,
                    })
                );
            }
            return;
        }
        const missingIds = methodMeta.middleFnIds?.filter((id) => !!id && this.requestId !== id) || [];
        missingIds.forEach((id) => {
            const subRequest = this.subRequestList[id];
            if (subRequest) return;
            const cacheKey = this.getPrefilledMiddleFnCacheKey(id);
            const cachedSubRequest = this.prefilledMiddleFnsCache.get(cacheKey);
            if (cachedSubRequest) {
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

    /** Restore prefilled middleFns for all routes in a routesFlow, deduplicating by ID */
    private restorePrefilledMiddleFnsForWorkflow(errors?: RequestErrors): void {
        const workflowRouteIds = new Set(this.workflowSubRequests!.map((sr) => sr.id));

        for (const routeSubRequest of this.workflowSubRequests!) {
            const methodMeta = routesCache.getMetadata(routeSubRequest.id);
            if (!methodMeta) {
                if (errors) {
                    errors.set(
                        routeSubRequest.id,
                        new RpcError({
                            type: 'route-metadata-not-found',
                            publicMessage: `Metadata for Route '${routeSubRequest.id}' not found.`,
                        })
                    );
                }
                continue;
            }
            const missingIds = methodMeta.middleFnIds?.filter((id) => !!id && !workflowRouteIds.has(id)) || [];
            missingIds.forEach((id) => {
                const subRequest = this.subRequestList[id];
                if (subRequest) return;
                const cacheKey = this.getPrefilledMiddleFnCacheKey(id);
                const cachedSubRequest = this.prefilledMiddleFnsCache.get(cacheKey);
                if (cachedSubRequest) {
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
    }

    private storePrefilledMiddleFns(errors: RequestErrors): void {
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
            const cacheKey = this.getPrefilledMiddleFnCacheKey(id);
            this.prefilledMiddleFnsCache.set(cacheKey, subRequest);
        });
    }

    private removePrefilledMiddleFns(): void {
        Object.keys(this.subRequestList).forEach((id) => {
            const cacheKey = this.getPrefilledMiddleFnCacheKey(id);
            this.prefilledMiddleFnsCache.delete(cacheKey);
        });
    }

    /** Returns true if the route is a query (isMutation === false) and not a routesFlow */
    private isQueryRoute(): boolean {
        if (this.workflowSubRequests) return false;
        const meta = routesCache.getMetadata(this.requestId);
        // strict false value required for queries
        return meta?.options?.isMutation === false;
    }

    private getPrefilledMiddleFnCacheKey(id: string): string {
        return `${this.options.baseURL}:${id}`;
    }
}

/**
 * Builds the RequestInit options for the fetch call, choosing between GET and POST:
 * - GET (query): Used for non-mutation routes (isMutation === false) with JSON serialization,
 *   where the base64url-encoded body fits within the URL length limit. The serialized data is
 *   sent as a `?data=` query parameter, with no request body.
 * - POST (mutation/route call): Used for all other cases: mutations, optimistic requests,
 *   routesFlow calls, non-JSON serializers, or when the GET URL would exceed MAX_GET_URL_LENGTH.
 *   The serialized data is sent in the request body with the appropriate Content-Type header.
 */
function buildFetchOptions(
    url: URL,
    serialized: ReturnType<typeof serializeRequestBody>,
    headersFromParams: Record<string, string>,
    options: ClientOptions,
    isOptimistic: boolean,
    isQuery: boolean,
    signal?: AbortSignal
): RequestInit {
    if (!isOptimistic && isQuery && serialized.contentType.includes('json')) {
        const encoded = toBase64Url(serialized.body as string);
        const testUrl = new URL(url.pathname + url.search, url.origin);
        testUrl.searchParams.set('data', encoded);

        if (testUrl.toString().length <= MAX_GET_URL_LENGTH) {
            url.searchParams.set('data', encoded);
            return {
                ...options.fetchOptions,
                method: 'GET',
                headers: {...options.fetchOptions.headers, ...headersFromParams},
                body: undefined,
                signal,
            };
        }
    }

    return {
        ...options.fetchOptions,
        method: 'POST',
        headers: {...options.fetchOptions.headers, ...headersFromParams, 'Content-Type': serialized.contentType},
        body: serialized.body as BodyInit,
        signal,
    };
}

/** Extracts headers from HeadersSubset params in headersFn methods */
function extractRequestHeaders(req: MionClientRequest<any, any>): Record<string, string> {
    const headers: Record<string, string> = {};
    const subRequestIds = Object.keys(req.subRequestList);

    for (let i = 0; i < subRequestIds.length; i++) {
        const id = subRequestIds[i];
        const subRequest = req.subRequestList[id];
        if (!subRequest) continue;

        const method = routesCache.getMetadata(id);
        if (!method || method.type !== HandlerType.headersMiddleFn || !method.headersParam) continue;

        const params = subRequest.params;
        const extracted = extractHeadersFromParams(params);
        Object.assign(headers, extracted);
    }

    return headers;
}

/** Extracts headers from a HeadersSubset parameter */
function extractHeadersFromParams(params: any[]): Record<string, string> {
    if (!params || params.length === 0) {
        throw new RpcError({
            type: 'missing-headers-param',
            publicMessage: 'HeadersFn requires a HeadersSubset parameter.',
        });
    }

    const firstParam = params[0];

    if (firstParam instanceof HeadersSubset) {
        return firstParam.headers as Record<string, string>;
    }

    if (firstParam && typeof firstParam === 'object' && 'headers' in firstParam && typeof firstParam.headers === 'object') {
        return firstParam.headers as Record<string, string>;
    }

    throw new RpcError({
        type: 'invalid-headers-param',
        publicMessage: 'HeadersFn first parameter must be a HeadersSubset instance or object with headers property.',
    });
}

/** Reconstructs a HeadersSubset from HTTP response headers for methods that return HeadersSubset */
function reconstructHeadersSubsetFromResponse(
    methodId: string,
    responseHeaders: Headers
): HeadersSubset<string, string> | undefined {
    const method = routesCache.getMetadata(methodId);

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

    if (Object.keys(headersMap).length > 0) {
        return new HeadersSubset(headersMap);
    }

    return undefined;
}

/** Builds a RoutesFlowQuery from route paths and subrequests, collecting any serverMapFrom mappings */
function buildRoutesFlowQuery(routePaths: string[], workflowSubRequests: RouteSubRequest<any>[]): RoutesFlowQuery {
    const allMappings: RoutesFlowMapping[] = [];
    for (const sr of workflowSubRequests) {
        // Duck-type check for mappings array (avoids circular import of MionSubRequest)
        const mappings = (sr as any).mappings;
        if (Array.isArray(mappings) && mappings.length > 0) {
            for (const ref of mappings) {
                allMappings.push({
                    fromId: ref.fromRequestId,
                    toId: ref.toRequestId,
                    bodyHash: ref.bodyHash,
                    paramIndex: ref.paramIndex,
                });
            }
        }
    }
    return {
        routes: routePaths,
        mappings: allMappings.length > 0 ? allMappings : undefined,
    };
}
