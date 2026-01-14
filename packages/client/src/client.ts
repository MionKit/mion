/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {DEFAULT_PREFILL_OPTIONS} from './constants';
import {
    ClientOptions,
    HookSubRequest,
    InitOptions,
    RouteSubRequest,
    SubRequest,
    RequestErrors,
    ClientRoutes,
    ClientHooks,
} from './types';
import type {RemoteApi} from '@mionkit/router';
import {registerErrorDeserializers} from '@mionkit/core';
import {getRouterItemId} from '@mionkit/core';
import {MionClientRequest} from './request';
import type {RunTypeError} from '@mionkit/core';
import {HandlersRegistry} from './handlersRegistry';
import {TypedPromise} from './typedPromise';
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
     * Executes a route call and distributes results to the TypedPromise.
     * This is the main orchestration method that:
     * 1. Executes the request via MionRequest
     * 2. Processes hook errors first (via HandlersRegistry for suppression)
     * 3. Processes route result/error
     * 4. Calls finally handler
     */
    executeCall<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]>(
        routeSubRequest: RR,
        hookSubRequests: RHList,
        typedPromise: TypedPromise<any, any>
    ): void {
        const request = new MionClientRequest(this.clientOptions, this.prefilledHooksCache, routeSubRequest, hookSubRequests);

        request
            .call()
            .then(() => {
                // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                // Success - distribute hook results to their registered success handlers
                this.processHookSuccess(allHooks);

                // Success - distribute the route result
                typedPromise.handleSuccess(routeSubRequest.result);
                typedPromise.handleFinally();
            })
            .catch((errors: RequestErrors) => {
                // Get ALL hooks from request.subRequestList (includes prefilled hooks restored from storage)
                const allHooks = this.getAllHooksFromRequest(request, routeSubRequest.id);

                // Process hook errors first (they can suppress route's catchUnknown)
                this.processHookErrors(allHooks, errors, typedPromise);

                // Process route error
                const routeError = errors.get(routeSubRequest.id) || findSubRequestError(routeSubRequest, errors);
                const routeMethodId = routeSubRequest.pointer.join('.');
                typedPromise.handleError(routeError, routeMethodId);

                // Finalize - call catch handler or reject promise if unhandled errors
                typedPromise.finalizeErrors();
                typedPromise.handleFinally();
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
            // Execute success handler if registered in HandlersRegistry
            this.handlersRegistry.executeSuccessHandler(hook.id, hook.result);
        }
    }

    /**
     * Process hook errors and check if they're handled by HandlersRegistry.
     * If handled by HandlersRegistry, mark them. Otherwise pass to TypedPromise handlers.
     */
    private processHookErrors(
        hookSubRequests: HookSubRequest<any>[],
        errors: RequestErrors,
        typedPromise: TypedPromise<any, any>
    ): void {
        for (const hook of hookSubRequests) {
            const hookError = errors.get(hook.id);
            if (hookError) {
                // Check if hook has onError handler in HandlersRegistry
                const handled = this.handlersRegistry.executeHandler(hook.id, hookError);
                if (handled) {
                    // Mark as handled - will suppress catchUnknown and catchError
                    typedPromise.markErrorHandled(hookError.type);
                } else {
                    // Not handled by HandlersRegistry - try TypedPromise handlers
                    const hookMethodId = hook.pointer.join('.');
                    typedPromise.handleError(hookError, hookMethodId);
                }
            }
        }
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
