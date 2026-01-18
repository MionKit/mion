/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionkit/core';
import type {HandlersRegistry} from './handlersRegistry';
import type {ErrorHandler, SuccessHandler} from './types';

// type-typed-event-start
/**
 * Persistent event emitter for hook success and error handling.
 * This is a passive container - the Client triggers handler execution via HandlersRegistry.
 *
 * TypedEvent stores handlers in the HandlersRegistry, where they persist across requests.
 * When a hook succeeds or fails, the Client checks the HandlersRegistry and executes the appropriate handler.
 *
 * @typeParam S - The success type returned by the hook
 * @typeParam E - Union of RpcError types (e.g., RpcError<'not-authorized', void> | RpcError<'rate-limited', {retryAfter: number}>)
 */
export class TypedEvent<S = void, E extends RpcError<string, any> = never> {
    /**
     * Create a TypedEvent linked to a specific hook.
     * @param handlerId - The unique identifier for the hook (e.g., 'auth', 'rateLimit')
     * @param registry - The shared HandlersRegistry instance
     */
    constructor(
        private readonly handlerId: string,
        private readonly registry: HandlersRegistry
    ) {}

    // ############# Public Methods (User-facing, chainable) #############

    /**
     * Register a persistent success handler for this hook.
     * Handler is stored in HandlersRegistry and called by Client for ALL future requests
     * that succeed with this hook.
     *
     * @param handler - The callback to execute when the hook succeeds
     * @returns this TypedEvent for chaining
     */
    onSuccess(handler: SuccessHandler<S>): TypedEvent<S, E> {
        this.registry.registerSuccess(this.handlerId, handler);
        return this;
    }

    /**
     * Remove a previously registered success handler from HandlersRegistry.
     * After calling this, successful results will no longer be delivered.
     *
     * @returns this TypedEvent for chaining
     */
    offSuccess(): TypedEvent<S, E> {
        this.registry.unregisterSuccess(this.handlerId);
        return this;
    }

    /**
     * Register a persistent error handler for this hook.
     * Handler is stored in HandlersRegistry and called by Client for ALL future requests
     * that fail with this error type from this hook.
     * The error parameter is fully typed including errorData.
     *
     * @param errorType - The error type to handle (e.g., 'invalid-token')
     * @param handler - The callback to execute when this error occurs
     * @returns this TypedEvent for chaining
     */
    onError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedEvent<S, E> {
        this.registry.register(this.handlerId, errorType, handler as ErrorHandler<any>);
        return this;
    }

    /**
     * Remove a previously registered error handler from HandlersRegistry.
     * After calling this, the error will no longer be handled by this hook's handler.
     *
     * @param errorType - The error type to stop handling
     * @returns this TypedEvent for chaining
     */
    offError<T extends E['type']>(errorType: T): TypedEvent<S, E> {
        this.registry.unregister(this.handlerId, errorType);
        return this;
    }

    /**
     * Get the handler ID this event is associated with.
     * Useful for debugging and testing.
     */
    getHandlerId(): string {
        return this.handlerId;
    }

    /**
     * Check if an error handler is registered for a specific error type.
     * Useful for debugging and testing.
     */
    hasErrorHandler(errorType: string): boolean {
        return this.registry.hasHandler(this.handlerId, errorType);
    }

    /**
     * Check if a success handler is registered.
     * Useful for debugging and testing.
     */
    hasSuccessHandler(): boolean {
        return this.registry.hasSuccessHandler(this.handlerId);
    }
}
// type-typed-event-end
