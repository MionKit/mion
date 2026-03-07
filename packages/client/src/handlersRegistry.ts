/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionjs/core';
import type {ErrorHandler, SuccessHandler} from './types';

/** Central registry for persistent middleFn handlers (both success and error) */
export class HandlersRegistry {
    private errorHandlers: Map<string, Map<string, ErrorHandler<any>>> = new Map();
    private successHandlers: Map<string, SuccessHandler<any>> = new Map();

    /** Register an error handler for a specific handler (middleFn) and error type */
    register(handlerId: string, errorType: string, handler: ErrorHandler<any>): void {
        let handlerMap = this.errorHandlers.get(handlerId);
        if (!handlerMap) {
            handlerMap = new Map();
            this.errorHandlers.set(handlerId, handlerMap);
        }
        handlerMap.set(errorType, handler);
    }

    /** Unregister an error handler for a specific handler and error type */
    unregister(handlerId: string, errorType: string): void {
        const handlerMap = this.errorHandlers.get(handlerId);
        if (handlerMap) {
            handlerMap.delete(errorType);
            if (handlerMap.size === 0) this.errorHandlers.delete(handlerId);
        }
    }

    /** Check if an error handler exists for a specific handler ID and error type */
    hasHandler(handlerId: string, errorType: string): boolean {
        const handlerMap = this.errorHandlers.get(handlerId);
        return handlerMap?.has(errorType) ?? false;
    }

    /** Get and execute the handler for an error, if it exists */
    executeHandler(handlerId: string, error: RpcError<string>): boolean {
        const handlerMap = this.errorHandlers.get(handlerId);
        if (!handlerMap) return false;

        const handler = handlerMap.get(error.type);
        if (!handler) return false;

        handler(error);
        return true;
    }

    /** Register a success handler for a specific middleFn */
    registerSuccess(handlerId: string, handler: SuccessHandler<any>): void {
        this.successHandlers.set(handlerId, handler);
    }

    /** Unregister a success handler for a specific middleFn */
    unregisterSuccess(handlerId: string): void {
        this.successHandlers.delete(handlerId);
    }

    /** Check if a success handler exists for a specific handler ID */
    hasSuccessHandler(handlerId: string): boolean {
        return this.successHandlers.has(handlerId);
    }

    /** Get and execute the success handler for a middleFn result, if it exists */
    executeSuccessHandler(handlerId: string, result: any): boolean {
        const handler = this.successHandlers.get(handlerId);
        if (!handler) return false;

        handler(result);
        return true;
    }

    /** Clear all handlers (both error and success) for a specific handler ID */
    clearHandlers(handlerId: string): void {
        this.errorHandlers.delete(handlerId);
        this.successHandlers.delete(handlerId);
    }

    /** Clear all registered handlers (both error and success) */
    clearAll(): void {
        this.errorHandlers.clear();
        this.successHandlers.clear();
    }

    /** Get all registered handler IDs */
    getHandlerIds(): string[] {
        const errorIds = Array.from(this.errorHandlers.keys());
        const successIds = Array.from(this.successHandlers.keys());
        return [...new Set([...errorIds, ...successIds])];
    }

    /** Get all error types registered for a handler ID */
    getErrorTypes(handlerId: string): string[] {
        const handlerMap = this.errorHandlers.get(handlerId);
        return handlerMap ? Array.from(handlerMap.keys()) : [];
    }
}
