/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {RunTypeError} from '@mionkit/core';
import type {HookSubRequest, RequestErrors, RouteSubRequest, SubRequest} from './types';
import type {MionClient} from './client';
import {TypedEvent} from './typedEvent';
import {TypedPromise} from './typedPromise';

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
    /** Result after resolution (undefined until resolved) */
    result?: S;
    /** Error after resolution (undefined until resolved) */
    error?: E;
    /** Serialized parameters for transport */
    serializedParams?: any[];

    /** Stored hooks for route calls */
    private storedHooks: HookSubRequest<any>[] = [];

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
     * Sets hooks to be used for the route call.
     */
    hooks(...hooks: HookSubRequest<any>[]): RouteSubRequest<any> & HookSubRequest<any> {
        this.storedHooks = hooks;
        return this as RouteSubRequest<any> & HookSubRequest<any>;
    }

    /**
     * Calls a remote route and returns TypedPromise for chainable error handling.
     * The TypedPromise is returned immediately and handlers are executed when the request completes.
     */
    call(): TypedPromise<S, E> {
        // Create TypedPromise (passive container)
        const typedPromise = new TypedPromise<S, E>();

        // Execute the request asynchronously - Client distributes results to TypedPromise
        this.client.executeCall(this as RouteSubRequest<any>, this.storedHooks, typedPromise);

        // Return immediately - user chains handlers
        return typedPromise;
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
