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
import {registerErrorDeserializers, RpcError} from '@mionkit/core';
import {getRouterItemId} from '@mionkit/core';
import {MionRequest} from './request';
import type {RunTypeError} from '@mionkit/core';
import {ErrorRegistry} from './errorRegistry';
import {TypedPromise} from './typedPromise';
import {TypedEvent} from './typedEvent';

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
    readonly errorRegistry: ErrorRegistry = new ErrorRegistry();

    constructor(private clientOptions: ClientOptions) {}

    /**
     * Executes a route call and distributes results to the TypedPromise.
     * This is the main orchestration method that:
     * 1. Executes the request via MionRequest
     * 2. Processes hook errors first (via ErrorRegistry for suppression)
     * 3. Processes route result/error
     * 4. Calls finally handler
     */
    executeCall<RR extends RouteSubRequest<any>, RHList extends HookSubRequest<any>[]>(
        routeSubRequest: RR,
        hookSubRequests: RHList,
        typedPromise: TypedPromise<any, any>
    ): void {
        const request = new MionRequest(this.clientOptions, routeSubRequest, hookSubRequests);

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
                const routeError = errors.get(routeSubRequest.id) || findError(routeSubRequest, errors);
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
        request: MionRequest<RouteSubRequest<any>, HookSubRequest<any>[]>,
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
            // Execute success handler if registered in ErrorRegistry
            this.errorRegistry.executeSuccessHandler(hook.id, hook.result);
        }
    }

    /**
     * Process hook errors and check if they're handled by ErrorRegistry.
     * If handled by ErrorRegistry, mark them. Otherwise pass to TypedPromise handlers.
     */
    private processHookErrors(
        hookSubRequests: HookSubRequest<any>[],
        errors: RequestErrors,
        typedPromise: TypedPromise<any, any>
    ): void {
        for (const hook of hookSubRequests) {
            const hookError = errors.get(hook.id);
            if (hookError) {
                // Check if hook has onError handler in ErrorRegistry
                const handled = this.errorRegistry.executeHandler(hook.id, hookError);
                if (handled) {
                    // Mark as handled - will suppress catchUnknown and catchError
                    typedPromise.markErrorHandled(hookError.type);
                } else {
                    // Not handled by ErrorRegistry - try TypedPromise handlers
                    const hookMethodId = hook.pointer.join('.');
                    typedPromise.handleError(hookError, hookMethodId);
                }
            }
        }
    }

    typeErrors<List extends SubRequest<any>[]>(...subRequest: List): Promise<RunTypeError[]> {
        const request = new MionRequest(this.clientOptions);
        return request.validateParams(subRequest);
    }

    prefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions);
        return request.prefill(subRequest);
    }

    removePrefill<List extends HookSubRequest<any>[]>(...subRequest: List): Promise<void> {
        const request = new MionRequest(this.clientOptions);
        return request.removePrefill(subRequest);
    }

    /**
     * Clear all error handlers from the registry.
     * Called when client is destroyed.
     */
    destroy(): void {
        this.errorRegistry.clearAll();
    }
}

// ############# Remote Methods Proxy   #############

class MethodProxy {
    propsProxies: Record<string, MethodProxy> = {};
    handler = {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        apply: (_target: any, _thisArg: any, argArray?: any): RouteSubRequest<any> & HookSubRequest<any> => {
            let storedHooks: HookSubRequest<any>[] = [];
            const handlerId = getRouterItemId(this.parentProps);

            // Using 'as any' because this is a dynamic proxy - actual types are inferred by ClientRoutes/ClientHooks
            const subRequest = {
                pointer: [...this.parentProps],
                id: handlerId,
                isResolved: false,
                params: argArray,
                result: undefined, // resolved once request gets resolved
                error: undefined, // resolved once request gets resolved

                /**
                 * Prefills Hook's parameters and returns TypedEvent for event handler registration.
                 * The TypedEvent allows registering:
                 * - onSuccess handlers called for ALL future successful requests from this hook
                 * - onError handlers called for ALL future requests that fail with specific error types
                 */
                prefill: (): TypedEvent<any, any> => {
                    // Create TypedEvent linked to this hook's ID and the shared ErrorRegistry
                    const typedEvent = new TypedEvent<any, any>(handlerId, this.client.errorRegistry);

                    // Execute validation and storage asynchronously
                    this.client.prefill(subRequest).catch((errors) => {
                        // Prefill errors are logged but not handled by TypedEvent
                        // They should be caught by the caller if needed
                        console.error('Prefill error:', findError(subRequest, errors));
                    });

                    // Return TypedEvent immediately for chaining handlers
                    return typedEvent;
                },

                /**
                 * Removes prefilled value and clears any registered error handlers for this hook.
                 */
                removePrefill: (): Promise<void> => {
                    // Clear error handlers for this hook from the registry
                    this.client.errorRegistry.clearHandlers(handlerId);
                    return this.client.removePrefill(subRequest).catch((errors) => Promise.reject(findError(subRequest, errors)));
                },

                /**
                 * Sets hooks to be used for the route call.
                 */
                hooks: (...hooks: HookSubRequest<any>[]): RouteSubRequest<any> & HookSubRequest<any> => {
                    storedHooks = hooks;
                    return subRequest;
                },

                /**
                 * Calls a remote route and returns TypedPromise for chainable error handling.
                 * The TypedPromise is returned immediately and handlers are executed when the request completes.
                 */
                call: (): TypedPromise<any, any> => {
                    // Create TypedPromise (passive container)
                    const typedPromise = new TypedPromise<any, any>();

                    // Execute the request asynchronously - Client distributes results to TypedPromise
                    this.client.executeCall(subRequest, storedHooks, typedPromise);

                    // Return immediately - user chains handlers
                    return typedPromise;
                },

                /**
                 * Validates parameters and returns type errors.
                 */
                typeErrors: (): Promise<RunTypeError[]> => {
                    return this.client
                        .typeErrors(subRequest as any)
                        .catch((errors) => Promise.reject(findError(subRequest as any, errors)));
                },
            } as unknown as RouteSubRequest<any> & HookSubRequest<any>;
            return subRequest;
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

function findError(req: SubRequest<any>, errors: RequestErrors): RpcError<string> {
    const specificError = errors.get(req.id);
    if (specificError) return specificError;

    const firstError = errors.values().next().value;
    if (firstError) return firstError;

    // Fallback error if no errors found (shouldn't happen)
    return new RpcError({
        type: 'unknown-error',
        publicMessage: 'An unknown error occurred',
    });
}
