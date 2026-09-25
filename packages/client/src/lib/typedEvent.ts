/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionjs/core';
import type {HandlersRegistry} from './handlersRegistry.ts';
import type {ErrorHandler, RequestHandler, ResponseHandler, SubRequest} from '../types.ts';

// type-typed-event-start
/** Persistent hooks of one middleware: its params before each request, its result or error after it */
export class TypedEvent<S = void, E extends RpcError<string, any> = never, P extends any[] = any[]> {
  constructor(
    private readonly handlerId: string,
    private readonly registry: HandlersRegistry,
    private readonly createSubRequest?: (params: any[]) => SubRequest<any>
  ) {}

  /** Register a persistent handler that gives this middleware its params before every request that runs it */
  onRequest(handler: RequestHandler<P>): TypedEvent<S, E, P> {
    if (!this.createSubRequest) throw new Error(`onRequest needs the middleware from the client, '${this.handlerId}' has none`);
    this.registry.registerRequest(this.handlerId, handler, this.createSubRequest);
    return this;
  }

  /** Remove a previously registered request handler from HandlersRegistry */
  offRequest(): TypedEvent<S, E, P> {
    this.registry.unregisterRequest(this.handlerId);
    return this;
  }

  /** Register a persistent handler for this middleware's successful result */
  onResponse(handler: ResponseHandler<S>): TypedEvent<S, E, P> {
    this.registry.registerResponse(this.handlerId, handler);
    return this;
  }

  /** Remove a previously registered response handler from HandlersRegistry */
  offResponse(): TypedEvent<S, E, P> {
    this.registry.unregisterResponse(this.handlerId);
    return this;
  }

  /** Register a persistent error handler for this middleware */
  onError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedEvent<S, E, P> {
    this.registry.register(this.handlerId, errorType, handler as ErrorHandler<any>);
    return this;
  }

  /** Remove a previously registered error handler from HandlersRegistry */
  offError<T extends E['type']>(errorType: T): TypedEvent<S, E, P> {
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

  /** Check if a response handler is registered */
  hasResponseHandler(): boolean {
    return this.registry.hasResponseHandler(this.handlerId);
  }

  /** Check if a request handler is registered */
  hasRequestHandler(): boolean {
    return this.registry.hasRequestHandler(this.handlerId);
  }
}
// type-typed-event-end
