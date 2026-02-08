/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionkit/core';
import type {RunTypeError} from '@mionkit/core';
import type {CallWithLinkedFnsResult, HSubRequest, RequestErrors, Result, RSubRequest, SubRequest} from './types';
import type {MionClient} from './client';
import {TypedEvent} from './typedEvent';

/**
 * Implementation of both RouteSubRequest and LinkedFnSubRequest interfaces.
 * This is returned by the MethodProxy when a remote method is invoked.
 */
export class MionSubRequest<S = any, E extends RpcError<string, any> = any> implements RSubRequest<any>, HSubRequest<any> {
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
        readonly client: MionClient
    ) {
        this.pointer = [...parentProps];
        this.id = handlerId;
        this.params = argArray;
    }

    /**
     * Prefills LinkedFn's parameters and returns TypedEvent for event handler registration.
     * The TypedEvent allows registering:
     * - onSuccess handlers called for ALL future successful requests from this linkedFn
     * - onError handlers called for ALL future requests that fail with specific error types
     */
    prefill(): TypedEvent<S, E> {
        // Create TypedEvent linked to this linkedFn's ID and the shared HandlersRegistry
        const typedEvent = new TypedEvent<S, E>(this.id, this.client.handlersRegistry);

        // Execute validation and storage asynchronously
        this.client.prefill(this as HSubRequest<any>).catch((errors: RequestErrors) => {
            // Prefill errors are logged but not handled by TypedEvent
            // They should be caught by the caller if needed
            console.error('Prefill error:', findSubRequestError(this, errors));
        });

        // Return TypedEvent immediately for chaining handlers
        return typedEvent;
    }

    /**
     * Removes prefilled value and clears any registered error handlers for this linkedFn.
     */
    removePrefill(): Promise<void> {
        // Clear error handlers for this linkedFn from the registry
        this.client.handlersRegistry.clearHandlers(this.id);
        return this.client.removePrefill(this as HSubRequest<any>);
    }

    /**
     * Calls a remote route and returns a Result 4-tuple with full typing preserved.
     * Never throws - errors are always in the result tuple.
     *
     * @returns Promise that resolves to [routeResult, routeError, linkedFnsResults, linkedFnsErrors] 4-tuple
     */
    call(): Promise<Result<S, E>> {
        return this.client.executeCall(this as unknown as RSubRequest<any>);
    }

    /**
     * Calls a remote route with linkedFns and returns a fully-typed 4-tuple result.
     * Always returns (never throws) - can have partial success where some linkedFns/route succeed and others fail.
     *
     * @param linkedFns Record of linkedFn names to LinkedFnSubRequest instances
     * @returns Promise that resolves to [routeResult, routeError, linkedFnsResults, linkedFnsErrors] 4-tuple
     */
    callWithLinkedFns<H extends Record<string, HSubRequest<any>>>(linkedFns: H): Promise<CallWithLinkedFnsResult<S, E, H>> {
        const linkedFnEntries = Object.entries(linkedFns);
        if (linkedFnEntries.length === 0) {
            throw new Error(
                'callWithLinkedFns requires at least one linkedFn. Use call() instead for requests without linkedFns.'
            );
        }
        const linkedFnSubRequests = linkedFnEntries.map(([, linkedFn]) => linkedFn);
        return this.client.executeCallWithLinkedFns(this as RSubRequest<any>, linkedFns, linkedFnSubRequests) as Promise<
            CallWithLinkedFnsResult<S, E, H>
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
