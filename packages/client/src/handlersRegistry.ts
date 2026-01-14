/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionkit/core';
import type {ErrorHandler, SuccessHandler} from './types';

/**
 * Central registry for persistent hook handlers (both success and error).
 * Used by TypedEvent to register handlers that persist across requests.
 * The Client uses this registry to execute handlers when hooks succeed or fail.
 *
 * Structure:
 * - errorHandlers: handlerId -> errorType -> handler
 * - successHandlers: handlerId -> handler
 */
export class HandlersRegistry {
    /** Map of handlerId -> (errorType -> handler) */
    private errorHandlers: Map<string, Map<string, ErrorHandler<any>>> = new Map();

    /** Map of handlerId -> success handler */
    private successHandlers: Map<string, SuccessHandler<any>> = new Map();

    // ############# Error Handler Methods #############

    /**
     * Register an error handler for a specific handler (hook) and error type.
     * @param handlerId - The unique identifier for the handler (e.g., hook ID like 'auth', 'rateLimit')
     * @param errorType - The error type string (e.g., 'invalid-token', 'rate-exceeded')
     * @param handler - The callback to execute when this error occurs
     */
    register(handlerId: string, errorType: string, handler: ErrorHandler<any>): void {
        let handlerMap = this.errorHandlers.get(handlerId);
        if (!handlerMap) {
            handlerMap = new Map();
            this.errorHandlers.set(handlerId, handlerMap);
        }
        handlerMap.set(errorType, handler);
    }

    /**
     * Unregister an error handler for a specific handler and error type.
     * @param handlerId - The unique identifier for the handler
     * @param errorType - The error type to remove
     */
    unregister(handlerId: string, errorType: string): void {
        const handlerMap = this.errorHandlers.get(handlerId);
        if (handlerMap) {
            handlerMap.delete(errorType);
            // Clean up empty maps
            if (handlerMap.size === 0) {
                this.errorHandlers.delete(handlerId);
            }
        }
    }

    /**
     * Check if an error handler exists for a specific handler ID and error type.
     * @param handlerId - The unique identifier for the handler
     * @param errorType - The error type to check
     * @returns true if a handler is registered, false otherwise
     */
    hasHandler(handlerId: string, errorType: string): boolean {
        const handlerMap = this.errorHandlers.get(handlerId);
        return handlerMap?.has(errorType) ?? false;
    }

    /**
     * Get and execute the handler for an error, if it exists.
     * @param handlerId - The unique identifier for the handler
     * @param error - The RpcError to handle
     * @returns true if a handler was executed, false otherwise
     */
    executeHandler(handlerId: string, error: RpcError<string>): boolean {
        const handlerMap = this.errorHandlers.get(handlerId);
        if (!handlerMap) return false;

        const handler = handlerMap.get(error.type);
        if (!handler) return false;

        handler(error);
        return true;
    }

    // ############# Success Handler Methods #############

    /**
     * Register a success handler for a specific hook.
     * Only one success handler can be registered per hook.
     * @param handlerId - The unique identifier for the handler
     * @param handler - The callback to execute when the hook succeeds
     */
    registerSuccess(handlerId: string, handler: SuccessHandler<any>): void {
        this.successHandlers.set(handlerId, handler);
    }

    /**
     * Unregister a success handler for a specific hook.
     * @param handlerId - The unique identifier for the handler
     */
    unregisterSuccess(handlerId: string): void {
        this.successHandlers.delete(handlerId);
    }

    /**
     * Check if a success handler exists for a specific handler ID.
     * @param handlerId - The unique identifier for the handler
     * @returns true if a success handler is registered, false otherwise
     */
    hasSuccessHandler(handlerId: string): boolean {
        return this.successHandlers.has(handlerId);
    }

    /**
     * Get and execute the success handler for a hook result, if it exists.
     * @param handlerId - The unique identifier for the handler
     * @param result - The success result to pass to the handler
     * @returns true if a handler was executed, false otherwise
     */
    executeSuccessHandler(handlerId: string, result: any): boolean {
        const handler = this.successHandlers.get(handlerId);
        if (!handler) return false;

        handler(result);
        return true;
    }

    // ############# Cleanup Methods #############

    /**
     * Clear all handlers (both error and success) for a specific handler ID.
     * Called when removePrefill() is invoked for a hook.
     * @param handlerId - The unique identifier for the handler
     */
    clearHandlers(handlerId: string): void {
        this.errorHandlers.delete(handlerId);
        this.successHandlers.delete(handlerId);
    }

    /**
     * Clear all registered handlers (both error and success).
     * Called when client is destroyed or for testing purposes.
     */
    clearAll(): void {
        this.errorHandlers.clear();
        this.successHandlers.clear();
    }

    /**
     * Get all registered handler IDs (for debugging/testing).
     * @returns Array of handler IDs
     */
    getHandlerIds(): string[] {
        const errorIds = Array.from(this.errorHandlers.keys());
        const successIds = Array.from(this.successHandlers.keys());
        return [...new Set([...errorIds, ...successIds])];
    }

    /**
     * Get all error types registered for a handler ID (for debugging/testing).
     * @param handlerId - The unique identifier for the handler
     * @returns Array of error types, or empty array if handler not found
     */
    getErrorTypes(handlerId: string): string[] {
        const handlerMap = this.errorHandlers.get(handlerId);
        return handlerMap ? Array.from(handlerMap.keys()) : [];
    }
}
