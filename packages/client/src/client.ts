/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    CallWithHooksResult,
    CallWithHooksData,
    CallWithHooksErrors,
    ClientOptions,
    HookSubRequest,
    InitOptions,
    RouteSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientHooks,
    Result,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {registerErrorDeserializers} from '@mionkit/core';
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
     * Executes a route call and returns a Result object.
     * This is the main orchestration method that:
     * 1. Executes the request via MionRequest
     * 2. Processes hook success/error handlers (fire-and-forget for prefill)
     * 3. Returns Result with data or error
     */
    executeCall<RR extends RouteSubRequest<any>>(routeSubRequest: RR): Promise<Result<any, any>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache, routeSubRequest, []);

            request
                .call()
                .then(() => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Success - distribute hook results to their registered success handlers (fire-and-forget)
                    this.processHookSuccess(allHooks);

                    // Return success result
                    resolve({data: routeSubRequest.resolvedValue});
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process hook errors (fire-and-forget for prefill handlers)
                    this.processHookErrors(allHooks, errors);

                    // Return error result
                    const routeError = errors.get(routeSubRequest.id) || findSubRequestError(routeSubRequest, errors);
                    resolve({error: routeError});
                });
        });
    }

    /**
     * Get all hooks from the request's subRequestList, excluding the route.
     * This includes both explicitly passed hooks and prefilled hooks restored from storage.
     */
    private getAllHooksFromRequest(
        request: MionClientRequest<RouteSubRequest<any>, HookSubRequest<any>[]>,
        routeId: string
    ): HookSubRequest<any>[] {
        return Object.entries(request.subRequestList)
            .filter(([id]) => id !== routeId)
            .map(([, subRequest]) => subRequest as HookSubRequest<any>);
    }

    /**
     * Process hook success results and call their registered success handlers.
     * Called by Client on successful requests to deliver hook results to listeners.
     */
    private processHookSuccess(hookSubRequests: HookSubRequest<any>[]): void {
        for (const hook of hookSubRequests) {
            // Execute success handler if registered in HandlersRegistry (persistent handlers from prefill)
            this.handlersRegistry.executeSuccessHandler(hook.id, hook.resolvedValue);
        }
    }

    /**
     * Process hook errors - fire-and-forget for prefill handlers.
     * Errors are passed to registered handlers but are not suppressed from the result.
     */
    private processHookErrors(hookSubRequests: HookSubRequest<any>[], errors: RequestErrors): void {
        for (const hook of hookSubRequests) {
            const hookError = errors.get(hook.id);
            if (hookError) {
                // Execute handler from HandlersRegistry if registered (for prefill) - fire-and-forget
                this.handlersRegistry.executeHandler(hook.id, hookError);
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
    executeCallWithHooks<H extends Record<string, HookSubRequest<any>>>(
        routeSubRequest: RouteSubRequest<any>,
        hooksRecord: H,
        hookSubRequests: HookSubRequest<any>[]
    ): Promise<CallWithHooksResult<any, any, H>> {
        return new Promise((resolve) => {
            const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache, routeSubRequest, hookSubRequests);

            request
                .call()
                .then(() => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Success - distribute hook results to their registered success handlers (prefill)
                    this.processHookSuccess(allHooks);

                    // Build the result object
                    const result = this.buildCallWithHooksResult(routeSubRequest, hooksRecord, undefined);
                    resolve(result);
                })
                .catch((errors: RequestErrors) => {
                    // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                    const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                    // Process hook errors for prefill handlers only
                    this.processHookErrorsForPrefill(allHooks, errors);

                    // Build the result object with errors
                    const result = this.buildCallWithHooksResult(routeSubRequest, hooksRecord, errors);
                    resolve(result);
                });
        });
    }

    /**
     * Process hook errors for prefill handlers only (no TypedPromise involvement).
     * Used by callWithHooks where errors are returned in the result object.
     */
    private processHookErrorsForPrefill(hookSubRequests: HookSubRequest<any>[], errors: RequestErrors): void {
        for (const hook of hookSubRequests) {
            const hookError = errors.get(hook.id);
            if (hookError) {
                // Execute handler from HandlersRegistry if registered (for prefill)
                this.handlersRegistry.executeHandler(hook.id, hookError);
            }
        }
    }

    /**
     * Build the CallWithHooksResult object from the request results.
     * Returns {data, errors} pattern similar to toResult().
     */
    private buildCallWithHooksResult<H extends Record<string, HookSubRequest<any>>>(
        routeSubRequest: RouteSubRequest<any>,
        hooksRecord: H,
        errors: RequestErrors | undefined
    ): CallWithHooksResult<any, any, H> {
        // Build data portion
        const data: CallWithHooksData<any, H> = {
            hooks: {} as CallWithHooksData<any, H>['hooks'],
        };

        // Build errors portion
        const resultErrors: CallWithHooksErrors<any, H> = {
            hooks: {} as CallWithHooksErrors<any, H>['hooks'],
        };

        // Process route
        const routeError = errors?.get(routeSubRequest.id);
        if (routeError) {
            resultErrors.route = routeError;
        } else if (routeSubRequest.resolvedValue !== undefined) {
            data.route = routeSubRequest.resolvedValue;
        }

        // Process hooks
        for (const [name, hook] of Object.entries(hooksRecord)) {
            const hookError = errors?.get(hook.id);
            if (hookError) {
                (resultErrors.hooks as Record<string, any>)[name] = hookError;
            } else if (hook.resolvedValue !== undefined) {
                (data.hooks as Record<string, any>)[name] = hook.resolvedValue;
            }
            // If neither error nor resolvedValue, the hook didn't execute - leave undefined
        }

        return {data, errors: resultErrors};
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache);
        return request.validateParams(subRequest);
    }

    prefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
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
        apply: (_target: any, _thisArg: any, argArray?: any): RouteSubRequest<any> & HookSubRequest<any> => {
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
