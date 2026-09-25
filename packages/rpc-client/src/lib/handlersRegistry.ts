/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionjs/core';
import type {ErrorHandler, MiddlewareContext, RequestHandler, ResponseHandler, SubRequest} from '../types.ts';

/** A request handler plus the middleware function that turns its params into a sub request */
export interface RequestHandlerEntry {
  handler: RequestHandler<any>;
  createSubRequest: (params: any[]) => SubRequest<any>;
}

/** Central registry for persistent middleware handlers: request, response and error */
export class HandlersRegistry {
  private errorHandlers: Map<string, Map<string, ErrorHandler<any>>> = new Map();
  private responseHandlers: Map<string, ResponseHandler<any>> = new Map();
  private requestHandlers: Map<string, RequestHandlerEntry> = new Map();

  register(handlerId: string, errorType: string, handler: ErrorHandler<any>): void {
    let handlerMap = this.errorHandlers.get(handlerId);
    if (!handlerMap) {
      handlerMap = new Map();
      this.errorHandlers.set(handlerId, handlerMap);
    }
    handlerMap.set(errorType, handler);
  }

  unregister(handlerId: string, errorType: string): void {
    const handlerMap = this.errorHandlers.get(handlerId);
    if (handlerMap) {
      handlerMap.delete(errorType);
      if (handlerMap.size === 0) this.errorHandlers.delete(handlerId);
    }
  }

  hasHandler(handlerId: string, errorType: string): boolean {
    const handlerMap = this.errorHandlers.get(handlerId);
    return handlerMap?.has(errorType) ?? false;
  }

  executeHandler(handlerId: string, error: RpcError<string>, context: MiddlewareContext): unknown {
    return this.errorHandlers.get(handlerId)?.get(error.type)?.(error, context);
  }

  registerResponse(handlerId: string, handler: ResponseHandler<any>): void {
    this.responseHandlers.set(handlerId, handler);
  }

  unregisterResponse(handlerId: string): void {
    this.responseHandlers.delete(handlerId);
  }

  hasResponseHandler(handlerId: string): boolean {
    return this.responseHandlers.has(handlerId);
  }

  executeResponseHandler(handlerId: string, result: any, context: MiddlewareContext): unknown {
    return this.responseHandlers.get(handlerId)?.(result, context);
  }

  registerRequest(
    handlerId: string,
    handler: RequestHandler<any>,
    createSubRequest: RequestHandlerEntry['createSubRequest']
  ): void {
    this.requestHandlers.set(handlerId, {handler, createSubRequest});
  }

  unregisterRequest(handlerId: string): void {
    this.requestHandlers.delete(handlerId);
  }

  hasRequestHandler(handlerId: string): boolean {
    return this.requestHandlers.has(handlerId);
  }

  getRequestHandler(handlerId: string): RequestHandlerEntry | undefined {
    return this.requestHandlers.get(handlerId);
  }

  getRequestHandlerIds(): string[] {
    return Array.from(this.requestHandlers.keys());
  }

  clearHandlers(handlerId: string): void {
    this.errorHandlers.delete(handlerId);
    this.responseHandlers.delete(handlerId);
    this.requestHandlers.delete(handlerId);
  }

  clearAll(): void {
    this.errorHandlers.clear();
    this.responseHandlers.clear();
    this.requestHandlers.clear();
  }

  getHandlerIds(): string[] {
    const errorIds = Array.from(this.errorHandlers.keys());
    const responseIds = Array.from(this.responseHandlers.keys());
    const requestIds = Array.from(this.requestHandlers.keys());
    return [...new Set([...errorIds, ...responseIds, ...requestIds])];
  }

  getErrorTypes(handlerId: string): string[] {
    const handlerMap = this.errorHandlers.get(handlerId);
    return handlerMap ? Array.from(handlerMap.keys()) : [];
  }
}
