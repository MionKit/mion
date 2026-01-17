/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {RunTypeError} from '@mionkit/core';
import type {CallWithHooksResult, HookSubRequest, RequestErrors, Result, RouteSubRequest, SubRequest} from './types';
import type {MionClient} from './client';
import {TypedEvent} from './typedEvent';

/**
 * Implementation of both RouteSubRequest and HookSubRequest interfaces.
 * This is returned by the MethodProxy when a remote method is invoked.
 */
export class MionSubRequest<S = any, E extends RpcError<string, any> = any> implements RouteSubRequest<any>, HookSubRequest<any> {
    /** The path segments to the method */
    pointer: string[];
    /** Unique identifier for this sub-request */
    id: string;
    /** Whether the request has been resolved */
    isResolved: boolean = false;
    /** Parameters to pass to the method */
    params: any[];
    /** The resolved value after the request completes successfully */
    resolvedValue?: S;
    /** Error after resolution (undefined until resolved) */
    error?: E;
    /** Serialized parameters for transport */
    serializedParams?: any[];

    constructor(
        parentProps: string[],
        handlerId: string,
        argArray: any[],
        private readonly client: MionClient
    ) {
        this.pointer = [...parentProps];
        this.id = handlerId;
        this.params = argArray;
    }

    /**
     * Prefills Hook's parameters and returns TypedEvent for event handler registration.
     * The TypedEvent allows registering:
     * - onSuccess handlers called for ALL future successful requests from this hook
     * - onError handlers called for ALL future requests that fail with specific error types
     */
    prefill(): TypedEvent<S, E> {
        // Create TypedEvent linked to this hook's ID and the shared HandlersRegistry
        const typedEvent = new TypedEvent<S, E>(this.id, this.client.handlersRegistry);

        // Execute validation and storage asynchronously
        this.client.prefill(this as HookSubRequest<any>).catch((errors: RequestErrors) => {
            // Prefill errors are logged but not handled by TypedEvent
            // They should be caught by the caller if needed
            console.error('Prefill error:', findSubRequestError(this, errors));
        });

        // Return TypedEvent immediately for chaining handlers
        return typedEvent;
    }

    /**
     * Removes prefilled value and clears any registered error handlers for this hook.
     */
    removePrefill(): Promise<void> {
        // Clear error handlers for this hook from the registry
        this.client.handlersRegistry.clearHandlers(this.id);
        return this.client.removePrefill(this as HookSubRequest<any>);
    }

    /**
     * Calls a remote route and returns a Result tuple with full typing preserved.
     * Never throws - errors are always in the result tuple.
     *
     * @returns Promise that resolves to [data, error] tuple
     *
     * @example
     * ```typescript
     * const [user, error] = await routes.users.getById('123').call();
     * if (error) {
     *     console.log(error.errorData?.userId);
     *     return;
     * }
     * console.log(user.name);
     * ```
     */
    call(): Promise<Result<S, E>> {
        return this.client.executeCall(this as unknown as RouteSubRequest<any>);
    }

    /**
     * Calls a remote route with hooks and returns a fully-typed result tuple.
     * Always returns (never throws) - can have partial success where some hooks/route succeed and others fail.
     *
     * @param hooks Record of hook names to HookSubRequest instances
     * @returns Promise that resolves to [data, errors] tuple containing route and hooks results
     *
     * @example
     * ```typescript
     * const [data, errors] = await routes.users.getById('123').callWithHooks({
     *     auth: hooks.auth(headers),
     *     session: hooks.session(token)
     * });
     *
     * if (errors.route) {
     *     console.log('Route failed:', errors.route.type);
     * } else if (data.route) {
     *     console.log('User:', data.route.name);
     * }
     * ```
     */
    callWithHooks<H extends Record<string, HookSubRequest<any>>>(hooks: H): Promise<CallWithHooksResult<S, E, H>> {
        const hookEntries = Object.entries(hooks);
        const hookSubRequests = hookEntries.map(([, hook]) => hook);
        return this.client.executeCallWithHooks(this as RouteSubRequest<any>, hooks, hookSubRequests) as Promise<
            CallWithHooksResult<S, E, H>
        >;
    }

    /**
     * Validates parameters and returns type errors.
     */
    typeErrors(): Promise<RunTypeError[]> {
        return this.client
            .typeErrors(this as SubRequest<any>)
            .catch((errors: RequestErrors) => Promise.reject(findSubRequestError(this, errors)));
    }
}

/**
 * Finds the most relevant error from the errors map for a given sub-request.
 * Returns the specific error for the sub-request if found, otherwise returns the first error.
 */
export function findSubRequestError(subRequest: SubRequest<any>, errors: RequestErrors): RpcError<string> {
    const specificError = errors.get(subRequest.id);
    if (specificError) return specificError;

    const firstError = errors.values().next().value;
    if (firstError) return firstError;

    // Fallback error if no errors found (shouldn't happen)
    return new RpcError({
        type: 'unknown-error',
        publicMessage: 'An unknown error occurred',
    });
}
