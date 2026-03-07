/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionjs/core';
import type {HandlersRegistry} from './handlersRegistry.ts';
import type {ErrorHandler, SuccessHandler} from './types.ts';

/** Persistent event emitter for middleFn success and error handling */
export class TypedEvent<S = void, E extends RpcError<string, any> = never> {
    constructor(
        private readonly handlerId: string,
        private readonly registry: HandlersRegistry
    ) {}

    /** Register a persistent success handler for this middleFn */
    onSuccess(handler: SuccessHandler<S>): TypedEvent<S, E> {
        this.registry.registerSuccess(this.handlerId, handler);
        return this;
    }

    /** Remove a previously registered success handler from HandlersRegistry */
    offSuccess(): TypedEvent<S, E> {
        this.registry.unregisterSuccess(this.handlerId);
        return this;
    }

    /** Register a persistent error handler for this middleFn */
    onError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedEvent<S, E> {
        this.registry.register(this.handlerId, errorType, handler as ErrorHandler<any>);
        return this;
    }

    /** Remove a previously registered error handler from HandlersRegistry */
    offError<T extends E['type']>(errorType: T): TypedEvent<S, E> {
        this.registry.unregister(this.handlerId, errorType);
        return this;
    }

    /** Get the handler ID this event is associated with */
    getHandlerId(): string {
        return this.handlerId;
    }

    /** Check if an error handler is registered for a specific error type */
    hasErrorHandler(errorType: string): boolean {
        return this.registry.hasHandler(this.handlerId, errorType);
    }

    /** Check if a success handler is registered */
    hasSuccessHandler(): boolean {
        return this.registry.hasSuccessHandler(this.handlerId);
    }
}
