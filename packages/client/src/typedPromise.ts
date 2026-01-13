/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionkit/core';
import type {ErrorHandler, UnknownErrorHandler} from './types';

/**
 * A Promise wrapper that provides typed error handling with chainable methods.
 * This is a passive container - the Client triggers handler execution.
 *
 * TypedPromise implements PromiseLike<S> for compatibility with async/await.
 *
 * @typeParam S - Success type (the resolved value type, excluding RpcError)
 * @typeParam E - Union of RpcError types (e.g., RpcError<'not-found', {id: string}> | RpcError<'forbidden', void>)
 *
 * @example
 * ```typescript
 * routes.users.getById('123').call()
 *   .catchError('user-not-found', (e) => {
 *     // e.errorData is fully typed based on the error type!
 *     console.log(e.publicMessage, e.errorData?.userId);
 *   })
 *   .catchUnknown((e) => console.log('Unknown error'))
 *   .finally(() => setLoading(false))
 *   .then((user) => console.log(user.name));
 * ```
 */
/** Handler for the catch method - receives all unhandled errors as a record */
export type CatchHandler = (errors: Record<string, RpcError<string, any>>) => void;

export class TypedPromise<S, E extends RpcError<string, any> = never> implements PromiseLike<S> {
    /** Map of error type -> handler */
    private errorHandlers: Map<string, ErrorHandler<any>> = new Map();
    /** Handler for unknown/unhandled errors */
    private unknownHandler?: UnknownErrorHandler;
    /** Handler for catch - receives record of all unhandled errors */
    private catchHandler?: CatchHandler;
    /** Cleanup callback */
    private finallyHandler?: () => void;
    /** Set of error types that have been handled (for suppression logic) */
    private handledErrors: Set<string> = new Set();
    /** Accumulated unhandled errors keyed by method/hook ID */
    private unhandledErrors: Record<string, RpcError<string, any>> = {};

    /** The underlying promise for async/await support */
    private readonly promise: Promise<S>;
    /** Resolve function for the underlying promise */
    private resolvePromise!: (value: S) => void;
    /** Reject function for the underlying promise */
    private rejectPromise!: (error: RpcError<string, any>) => void;

    constructor() {
        this.promise = new Promise<S>((resolve, reject) => {
            this.resolvePromise = resolve;
            this.rejectPromise = reject;
        });
    }

    // ############# Public Methods (User-facing, chainable) #############

    /**
     * Register success handler. Result is guaranteed to NOT be an RpcError.
     * Returns this TypedPromise for chaining - order doesn't matter.
     *
     * Also enables async/await support - `await typedPromise` works as expected.
     */
    then<TResult1 = S, TResult2 = never>(
        onFulfilled?: ((value: S) => TResult1 | PromiseLike<TResult1>) | null,
        onRejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ): TypedPromise<S, E> & PromiseLike<TResult1 | TResult2> {
        this.promise.then(onFulfilled, onRejected);
        return this as TypedPromise<S, E> & PromiseLike<TResult1 | TResult2>;
    }

    /**
     * Register handler for a specific error type.
     * Multiple catchError calls can be chained for different error types.
     * The error parameter is fully typed including errorData.
     * Returns this TypedPromise for chaining.
     */
    catchError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedPromise<S, E> {
        this.errorHandlers.set(errorType, handler as ErrorHandler<any>);
        return this;
    }

    /**
     * Register handler for any error not caught by catchError.
     * Hook errors handled by onError() are suppressed and won't reach catchUnknown.
     * Returns this TypedPromise for chaining.
     */
    catchUnknown(handler: UnknownErrorHandler): TypedPromise<S, E> {
        this.unknownHandler = handler;
        return this;
    }

    /**
     * Register a handler for unhandled errors.
     * Called when errors are NOT caught by catchError or catchUnknown.
     * Receives a record of all unhandled errors keyed by method/hook ID.
     * Returns this TypedPromise for chaining.
     *
     * @example
     * ```typescript
     * await routes.users.getById('123').call()
     *   .catchError('user-not-found', (e) => console.log(e))
     *   .catch((errors) => {
     *     // errors: { 'users.getById'?: RpcError, 'auth'?: RpcError, ... }
     *     for (const [methodId, error] of Object.entries(errors)) {
     *       console.log(`Unhandled error from ${methodId}:`, error);
     *     }
     *   });
     * ```
     */
    catch(onRejected: (errors: Record<string, RpcError<string, any>>) => void): TypedPromise<S, E> {
        this.catchHandler = onRejected;
        return this;
    }

    /**
     * Register cleanup callback that always runs (success or error).
     * Returns this TypedPromise for chaining.
     */
    finally(onFinally: () => void): TypedPromise<S, E> {
        this.finallyHandler = onFinally;
        return this;
    }

    // ############# Internal Methods (Called by Client) #############

    /**
     * Check if this TypedPromise has a handler for a specific error type.
     * Used by Client to determine routing.
     */
    hasHandler(errorType: string): boolean {
        return this.errorHandlers.has(errorType);
    }

    /**
     * Check if an error has already been handled (e.g., by a hook's onError).
     * Used by Client to prevent duplicate handling.
     */
    isErrorHandled(errorType: string): boolean {
        return this.handledErrors.has(errorType);
    }

    /**
     * Mark an error type as handled.
     * Called by Client after executing a hook's onError handler.
     */
    markErrorHandled(errorType: string): void {
        this.handledErrors.add(errorType);
    }

    /**
     * Execute the appropriate handler for an error.
     * Returns true if a handler was executed, false if error is unhandled.
     * Called by Client during error distribution.
     *
     * Logic:
     * 1. If error type has a specific catchError handler, execute it
     * 2. If not, and error is not already handled (suppressed), try catchUnknown
     * 3. If no handler catches it, accumulate in unhandledErrors for catch() method
     *
     * @param error - The RpcError to handle
     * @param methodId - The method/hook ID that produced this error
     */
    handleError(error: RpcError<string, any>, methodId: string): boolean {
        // 1. Check for specific catchError handler
        const handler = this.errorHandlers.get(error.type);
        if (handler) {
            handler(error);
            this.markErrorHandled(error.type);
            return true;
        }

        // 2. Fall through to catchUnknown (if not suppressed by hook handler)
        // Note: Hook suppression is checked by Client BEFORE calling this method
        if (this.unknownHandler && !this.isErrorHandled(error.type)) {
            this.unknownHandler(error);
            this.markErrorHandled(error.type);
            return true;
        }

        // 3. No handler caught the error - accumulate for catch() method
        if (!this.isErrorHandled(error.type)) {
            this.unhandledErrors[methodId] = error;
        }

        return false;
    }

    /**
     * Finalize error handling after all errors have been processed.
     * If there are unhandled errors and a catch handler, call it.
     * If all errors were handled, resolve the promise (so await completes).
     * Otherwise reject the promise with the first unhandled error.
     * Called by Client after processing all errors.
     */
    finalizeErrors(): void {
        const hasUnhandledErrors = Object.keys(this.unhandledErrors).length > 0;

        if (!hasUnhandledErrors) {
            // All errors were handled by catchError/catchUnknown - resolve promise
            // Use undefined as value since we're in error state but it was handled
            this.resolvePromise(undefined as S);
            return;
        }

        if (this.catchHandler) {
            // Call catch handler with all unhandled errors, then resolve
            this.catchHandler(this.unhandledErrors);
            this.resolvePromise(undefined as S);
        } else {
            // No catch handler - reject promise with first unhandled error
            const firstError = Object.values(this.unhandledErrors)[0];
            this.rejectPromise(firstError);
        }
    }

    /**
     * Execute success handler with the result.
     * Called by Client when request succeeds.
     */
    handleSuccess(value: S): void {
        // Resolve the underlying promise (for async/await support)
        this.resolvePromise(value);
        // Note: successHandler is called via .then() promise chain
    }

    /**
     * Execute the finally handler.
     * Called by Client after all other handlers.
     */
    handleFinally(): void {
        if (this.finallyHandler) {
            this.finallyHandler();
        }
    }
}
