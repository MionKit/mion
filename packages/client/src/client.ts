/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    CallWithLinkedFnsResult,
    ClientOptions,
    HSubRequest,
    LinkedFnSuccess,
    LinkedFnError,
    InitOptions,
    RSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientLinkedFns,
    Result,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {registerErrorDeserializers, RpcError} from '@mionkit/core';
import {getRouterItemId} from '@mionkit/core';
import {MionClientRequest} from './request';
import type {RunTypeError} from '@mionkit/core';
import {HandlersRegistry} from './handlersRegistry';
import {MionSubRequest, findSubRequestError} from './subRequest';

export function initClient<RM extends RemoteApi>(
    options: InitOptions
): {client: MionClient; routes: ClientRoutes<RM>; linkedFns: ClientLinkedFns<RM>} {
    registerErrorDeserializers();
    const clientOptions = {
        ...DEFAULT_PREFILL_OPTIONS,
        ...options,
    };
    const client = new MionClient(clientOptions);
    const rootProxy = new MethodProxy([], client, clientOptions);
    return {
        client,
        routes: rootProxy.proxy as ClientRoutes<RM>,
        linkedFns: rootProxy.proxy as ClientLinkedFns<RM>,
    };
}

// ############# Client   #############
// state is managed inside a class in case multiple clients are required (using multiple apis)
export class MionClient {
    /** Shared registry for persistent linkedFn error handlers */
    readonly handlersRegistry = new HandlersRegistry();

    /** In-memory cache for prefilled linkedFn subrequests (keyed by baseURL:linkedFnId) */
    readonly prefilledLinkedFnsCache = new Map<string, SubRequest<any>>();

    constructor(private clientOptions: ClientOptions) {}

    /**
     * Executes a route call and returns a Result 4-tuple.
     * This is the main orchestration method that:
     * 1. Executes the request via MionRequest
     * 2. Processes linkedFn success/error handlers (fire-and-forget for prefill)
     * 3. Returns [routeResult, routeError, linkedFnsResults, linkedFnsErrors] 4-tuple
     */
    executeCall<RR extends RSubRequest<any>>(routeSubRequest: RR): Promise<Result<any, any>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache, routeSubRequest, []);

            request
                .call()
                .then(() => {
                    // Get ALL linkedFns from request.subRequestList (includes prefilled linkedFns restored from storage)
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);

                    // Process all linkedFn responses - call success/error handlers for each linkedFn individually
                    this.processLinkedFnsResponses(allLinkedFns, undefined);

                    // Build linkedFns results/errors from prefilled linkedFns (and any server-side linkedFn errors)
                    const {linkedFnsResults, linkedFnsErrors} = this.buildLinkedFnsResultsFromList(
                        allLinkedFns,
                        undefined,
                        routeSubRequest.id
                    );

                    // Return success result 4-tuple
                    resolve([routeSubRequest.resolvedValue, undefined, linkedFnsResults, linkedFnsErrors]);
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL linkedFns from request.subRequestList (includes prefilled linkedFns restored from storage)
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);

                    // Process all linkedFn responses - call success/error handlers for each linkedFn individually
                    // LinkedFns with runOnError=true may succeed even when the route fails
                    this.processLinkedFnsResponses(allLinkedFns, errors);

                    // Build linkedFns results/errors from prefilled linkedFns (and any server-side linkedFn errors)
                    const {linkedFnsResults, linkedFnsErrors} = this.buildLinkedFnsResultsFromList(
                        allLinkedFns,
                        errors,
                        routeSubRequest.id
                    );

                    // Return error result 4-tuple
                    const routeError = errors.get(routeSubRequest.id) || findSubRequestError(routeSubRequest, errors);
                    // route result is never successful if there is an error
                    resolve([undefined, routeError, linkedFnsResults, linkedFnsErrors]);
                });
        });
    }

    /**
     * Build linkedFns results and errors from a list of linkedFn sub-requests.
     * Used by executeCall() to collect prefilled linkedFn data.
     * Also includes errors from linkedFns that ran on the server but weren't explicitly requested by the client
     * (e.g., from @thrownErrors in the response body - validation errors, serialization errors, etc.)
     */
    private buildLinkedFnsResultsFromList(
        linkedFnSubRequests: HSubRequest<any>[],
        errors: RequestErrors | undefined,
        routeId?: string
    ): {linkedFnsResults: Record<string, unknown>; linkedFnsErrors: Record<string, RpcError<string, unknown>>} {
        const linkedFnsResults: Record<string, unknown> = {};
        const linkedFnsErrors: Record<string, RpcError<string, unknown>> = {};

        // Collect IDs of linkedFns we've explicitly processed
        const processedIds = new Set<string>();
        if (routeId) {
            processedIds.add(routeId);
        }

        for (const linkedFn of linkedFnSubRequests) {
            processedIds.add(linkedFn.id);
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                linkedFnsErrors[linkedFn.id] = linkedFnError;
            } else if (linkedFn.resolvedValue !== undefined) {
                linkedFnsResults[linkedFn.id] = linkedFn.resolvedValue;
            }
        }

        // Also include errors from linkedFns that ran on the server but weren't explicitly requested
        // These come from @thrownErrors in the response body (e.g., validation errors, serialization errors)
        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    linkedFnsErrors[id] = error;
                }
            }
        }

        return {linkedFnsResults, linkedFnsErrors};
    }

    /**
     * Get all linkedFns from the request's subRequestList, excluding the route.
     * This includes both explicitly passed linkedFns and prefilled linkedFns restored from storage.
     */
    private getAllLinkedFnsFromRequest(
        request: MionClientRequest<RSubRequest<any>, HSubRequest<any>[]>,
        routeId: string
    ): HSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => id !== routeId)
            .map(([, subRequest]) => subRequest as HSubRequest<any>);
    }

    /**
     * Process all linkedFn responses - call success or error handlers for each linkedFn individually.
     * This is indifferent to the overall request success/error - each linkedFn is processed based on its own result.
     * LinkedFns with runOnError=true may succeed even when the route fails, and their success handlers should be called.
     */
    private processLinkedFnsResponses(linkedFnSubRequests: HSubRequest<any>[], errors: RequestErrors | undefined): void {
        for (const linkedFn of linkedFnSubRequests) {
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                // LinkedFn failed - execute error handler if registered
                this.handlersRegistry.executeHandler(linkedFn.id, linkedFnError);
            } else if (linkedFn.resolvedValue !== undefined) {
                // LinkedFn succeeded - execute success handler if registered
                this.handlersRegistry.executeSuccessHandler(linkedFn.id, linkedFn.resolvedValue);
            }
        }
    }

    /**
     * Executes a route call with linkedFns and returns a typed result object.
     * This method always returns (never throws) and supports partial success scenarios.
     *
     * @param routeSubRequest The route to execute
     * @param linkedFnsRecord Record of linkedFn names to LinkedFnSubRequest instances
     * @param linkedFnSubRequests Array of linkedFn subrequests to execute
     * @returns Promise resolving to CallWithLinkedFnsResult
     */
    executeCallWithLinkedFns<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        linkedFnsRecord: H,
        linkedFnSubRequests: HSubRequest<any>[]
    ): Promise<CallWithLinkedFnsResult<any, any, H>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(
                this.clientOptions,
                this.prefilledLinkedFnsCache,
                routeSubRequest,
                linkedFnSubRequests
            );

            request
                .call()
                .then(() => {
                    // Get ALL linkedFns from request.subRequestList (includes prefilled linkedFns restored from storage)
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);

                    // Process all linkedFn responses - call success/error handlers for each linkedFn individually
                    this.processLinkedFnsResponses(allLinkedFns, undefined);

                    // Build the result object
                    const result = this.buildCallWithLinkedFnsResult(routeSubRequest, linkedFnsRecord, undefined);
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL linkedFns from request.subRequestList (includes prefilled linkedFns restored from storage)
                    const allLinkedFns = this.getAllLinkedFnsFromRequest(request, routeSubRequest.id);

                    // Process all linkedFn responses - call success/error handlers for each linkedFn individually
                    // LinkedFns with runOnError=true may succeed even when the route fails
                    this.processLinkedFnsResponses(allLinkedFns, errors);

                    // Build the result object with errors
                    const result = this.buildCallWithLinkedFnsResult(routeSubRequest, linkedFnsRecord, errors);
                    resolve(result);
                });
        });
    }

    /**
     * Build the CallWithLinkedFnsResult 4-tuple from the request results.
     * Returns [routeResult, routeError, linkedFnsResults, linkedFnsErrors] 4-tuple.
     * Also includes errors from linkedFns that ran on the server but weren't explicitly requested
     * (e.g., from @thrownErrors in the response body - validation errors, serialization errors, etc.)
     */
    private buildCallWithLinkedFnsResult<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        linkedFnsRecord: H,
        errors: RequestErrors | undefined
    ): CallWithLinkedFnsResult<any, any, H> {
        // Process route
        const routeError = errors?.get(routeSubRequest.id);
        const routeResult = routeError ? undefined : routeSubRequest.resolvedValue;

        // Build linkedFns results/errors
        const linkedFnsResults = {} as {[K in keyof H]?: LinkedFnSuccess<H[K]>};
        const linkedFnsErrors = {} as {[K in keyof H]?: LinkedFnError<H[K]>};

        // Collect IDs of linkedFns and route we've explicitly processed
        const processedIds = new Set<string>([routeSubRequest.id]);

        // Process linkedFns
        for (const [name, linkedFn] of Object.entries(linkedFnsRecord)) {
            processedIds.add(linkedFn.id);
            const linkedFnError = errors?.get(linkedFn.id);
            if (linkedFnError) {
                (linkedFnsErrors as Record<string, any>)[name] = linkedFnError;
            } else if (linkedFn.resolvedValue !== undefined) {
                (linkedFnsResults as Record<string, any>)[name] = linkedFn.resolvedValue;
            }
            // If neither error nor resolvedValue, the linkedFn didn't execute - leave undefined
        }

        // Also include errors from linkedFns that ran on the server but weren't explicitly requested
        // These come from @thrownErrors in the response body (e.g., validation errors, serialization errors)
        // Store them using their ID as the key (since they're not in the typed linkedFnsRecord)
        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    (linkedFnsErrors as Record<string, any>)[id] = error;
                }
            }
        }

        return [routeResult, routeError, linkedFnsResults, linkedFnsErrors];
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
        return request.validateParams(subRequest);
    }

    prefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledLinkedFnsCache);
        return request.removePrefill(subRequest);
    }

    /**
     * Clear all error handlers from the registry.
     * Called when client is destroyed.
     */
    destroy(): void {
        this.handlersRegistry.clearAll();
    }
}

// ############# Remote Methods Proxy   #############

class MethodProxy {
    propsProxies: Record<string, MethodProxy> = {};
    handler = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apply: (_target: any, _thisArg: any, argArray?: any): RSubRequest<any> & HSubRequest<any> => {
            const handlerId = getRouterItemId(this.parentProps);
            return new MionSubRequest(this.parentProps, handlerId, argArray, this.client);
        },

        get: (_target: any, prop: string): typeof Proxy => {
            const existing = this.propsProxies[prop];
            if (existing) return existing.proxy;
            const newMethodProxy = new MethodProxy([...this.parentProps, prop], this.client, this.clientOptions);
            this.propsProxies[prop] = newMethodProxy;
            return newMethodProxy.proxy;
        },
    };

    proxy: typeof Proxy;

    constructor(
        public parentProps: string[],
        private client: MionClient,
        private clientOptions: ClientOptions
    ) {
        // the target must be a function so the handler can trap calls using apply
        const target = () => null;
        this.proxy = new Proxy(target, this.handler);
    }
}
