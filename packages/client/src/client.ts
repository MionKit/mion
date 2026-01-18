/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    CallWithHooksResult,
    ClientOptions,
    HSubRequest,
    HookSuccess,
    HookError,
    InitOptions,
    RSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientHooks,
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
): {client: MionClient; routes: ClientRoutes<RM>; hooks: ClientHooks<RM>} {
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
        hooks: rootProxy.proxy as ClientHooks<RM>,
    };
}

// ############# Client   #############
// state is managed inside a class in case multiple clients are required (using multiple apis)
export class MionClient {
    /** Shared registry for persistent hook error handlers */
    readonly handlersRegistry = new HandlersRegistry();

    /** In-memory cache for prefilled hook subrequests (keyed by baseURL:hookId) */
    readonly prefilledHooksCache = new Map<string, SubRequest<any>>();

    constructor(private clientOptions: ClientOptions) {}

    /**
     * Executes a route call and returns a Result 4-tuple.
     * This is the main orchestration method that:
     * 1. Executes the request via MionRequest
     * 2. Processes hook success/error handlers (fire-and-forget for prefill)
     * 3. Returns [routeResult, routeError, hooksResults, hooksErrors] 4-tuple
     */
    executeCall<RR extends RSubRequest<any>>(routeSubRequest: RR): Promise<Result<any, any>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache, routeSubRequest, []);

            request
                .call()
                .then(() => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process all hook responses - call success/error handlers for each hook individually
                    this.processHooksResponses(allHooks, undefined);

                    // Build hooks results/errors from prefilled hooks (and any server-side hook errors)
                    const {hooksResults, hooksErrors} = this.buildHooksResultsFromList(allHooks, undefined, routeSubRequest.id);

                    // Return success result 4-tuple
                    resolve([routeSubRequest.resolvedValue, undefined, hooksResults, hooksErrors]);
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process all hook responses - call success/error handlers for each hook individually
                    // Hooks with runOnError=true may succeed even when the route fails
                    this.processHooksResponses(allHooks, errors);

                    // Build hooks results/errors from prefilled hooks (and any server-side hook errors)
                    const {hooksResults, hooksErrors} = this.buildHooksResultsFromList(allHooks, errors, routeSubRequest.id);

                    // Return error result 4-tuple
                    const routeError = errors.get(routeSubRequest.id) || findSubRequestError(routeSubRequest, errors);
                    // route result is never successful if there is an error
                    resolve([undefined, routeError, hooksResults, hooksErrors]);
                });
        });
    }

    /**
     * Build hooks results and errors from a list of hook sub-requests.
     * Used by executeCall() to collect prefilled hook data.
     * Also includes errors from hooks that ran on the server but weren't explicitly requested by the client
     * (e.g., from @thrownErrors in the response body - validation errors, serialization errors, etc.)
     */
    private buildHooksResultsFromList(
        hookSubRequests: HSubRequest<any>[],
        errors: RequestErrors | undefined,
        routeId?: string
    ): {hooksResults: Record<string, unknown>; hooksErrors: Record<string, RpcError<string, unknown>>} {
        const hooksResults: Record<string, unknown> = {};
        const hooksErrors: Record<string, RpcError<string, unknown>> = {};

        // Collect IDs of hooks we've explicitly processed
        const processedIds = new Set<string>();
        if (routeId) {
            processedIds.add(routeId);
        }

        for (const hook of hookSubRequests) {
            processedIds.add(hook.id);
            const hookError = errors?.get(hook.id);
            if (hookError) {
                hooksErrors[hook.id] = hookError;
            } else if (hook.resolvedValue !== undefined) {
                hooksResults[hook.id] = hook.resolvedValue;
            }
        }

        // Also include errors from hooks that ran on the server but weren't explicitly requested
        // These come from @thrownErrors in the response body (e.g., validation errors, serialization errors)
        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    hooksErrors[id] = error;
                }
            }
        }

        return {hooksResults, hooksErrors};
    }

    /**
     * Get all hooks from the request's subRequestList, excluding the route.
     * This includes both explicitly passed hooks and prefilled hooks restored from storage.
     */
    private getAllHooksFromRequest(
        request: MionClientRequest<RSubRequest<any>, HSubRequest<any>[]>,
        routeId: string
    ): HSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => id !== routeId)
            .map(([, subRequest]) => subRequest as HSubRequest<any>);
    }

    /**
     * Process all hook responses - call success or error handlers for each hook individually.
     * This is indifferent to the overall request success/error - each hook is processed based on its own result.
     * Hooks with runOnError=true may succeed even when the route fails, and their success handlers should be called.
     */
    private processHooksResponses(hookSubRequests: HSubRequest<any>[], errors: RequestErrors | undefined): void {
        for (const hook of hookSubRequests) {
            const hookError = errors?.get(hook.id);
            if (hookError) {
                // Hook failed - execute error handler if registered
                this.handlersRegistry.executeHandler(hook.id, hookError);
            } else if (hook.resolvedValue !== undefined) {
                // Hook succeeded - execute success handler if registered
                this.handlersRegistry.executeSuccessHandler(hook.id, hook.resolvedValue);
            }
        }
    }

    /**
     * Executes a route call with hooks and returns a typed result object.
     * This method always returns (never throws) and supports partial success scenarios.
     *
     * @param routeSubRequest The route to execute
     * @param hooksRecord Record of hook names to HookSubRequest instances
     * @param hookSubRequests Array of hook subrequests to execute
     * @returns Promise resolving to CallWithHooksResult
     */
    executeCallWithHooks<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        hooksRecord: H,
        hookSubRequests: HSubRequest<any>[]
    ): Promise<CallWithHooksResult<any, any, H>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache, routeSubRequest, hookSubRequests);

            request
                .call()
                .then(() => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process all hook responses - call success/error handlers for each hook individually
                    this.processHooksResponses(allHooks, undefined);

                    // Build the result object
                    const result = this.buildCallWithHooksResult(routeSubRequest, hooksRecord, undefined);
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process all hook responses - call success/error handlers for each hook individually
                    // Hooks with runOnError=true may succeed even when the route fails
                    this.processHooksResponses(allHooks, errors);

                    // Build the result object with errors
                    const result = this.buildCallWithHooksResult(routeSubRequest, hooksRecord, errors);
                    resolve(result);
                });
        });
    }

    /**
     * Build the CallWithHooksResult 4-tuple from the request results.
     * Returns [routeResult, routeError, hooksResults, hooksErrors] 4-tuple.
     * Also includes errors from hooks that ran on the server but weren't explicitly requested
     * (e.g., from @thrownErrors in the response body - validation errors, serialization errors, etc.)
     */
    private buildCallWithHooksResult<H extends Record<string, HSubRequest<any>>>(
        routeSubRequest: RSubRequest<any>,
        hooksRecord: H,
        errors: RequestErrors | undefined
    ): CallWithHooksResult<any, any, H> {
        // Process route
        const routeError = errors?.get(routeSubRequest.id);
        const routeResult = routeError ? undefined : routeSubRequest.resolvedValue;

        // Build hooks results/errors
        const hooksResults = {} as {[K in keyof H]?: HookSuccess<H[K]>};
        const hooksErrors = {} as {[K in keyof H]?: HookError<H[K]>};

        // Collect IDs of hooks and route we've explicitly processed
        const processedIds = new Set<string>([routeSubRequest.id]);

        // Process hooks
        for (const [name, hook] of Object.entries(hooksRecord)) {
            processedIds.add(hook.id);
            const hookError = errors?.get(hook.id);
            if (hookError) {
                (hooksErrors as Record<string, any>)[name] = hookError;
            } else if (hook.resolvedValue !== undefined) {
                (hooksResults as Record<string, any>)[name] = hook.resolvedValue;
            }
            // If neither error nor resolvedValue, the hook didn't execute - leave undefined
        }

        // Also include errors from hooks that ran on the server but weren't explicitly requested
        // These come from @thrownErrors in the response body (e.g., validation errors, serialization errors)
        // Store them using their ID as the key (since they're not in the typed hooksRecord)
        if (errors) {
            for (const [id, error] of errors) {
                if (!processedIds.has(id)) {
                    (hooksErrors as Record<string, any>)[id] = error;
                }
            }
        }

        return [routeResult, routeError, hooksResults, hooksErrors];
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache);
        return request.validateParams(subRequest);
    }

    prefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache);
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
