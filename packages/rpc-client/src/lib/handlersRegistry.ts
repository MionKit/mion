/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {ErrorHandler, RequestHandler, ResponseHandler, SubRequest} from '../types.ts';

/** A request handler plus the middleware function that turns its params into a sub request */
export interface RequestHandlerEntry {
  handler: RequestHandler<any>;
  createSubRequest: (params: any[]) => SubRequest<any>;
  /** the installer that set it, like `useSyncRoutes` */
  owner?: string;
}

/** Central registry for persistent middleware handlers: request, response and error */
export class HandlersRegistry {
  private errorHandlers: Map<string, Map<string, ErrorHandler<any>[]>> = new Map();
  private responseHandlers: Map<string, ResponseHandler<any>[]> = new Map();
  private requestHandlers: Map<string, RequestHandlerEntry> = new Map();

  register(handlerId: string, errorType: string, handler: ErrorHandler<any>): void {
    let handlerMap = this.errorHandlers.get(handlerId);
    if (!handlerMap) {
      handlerMap = new Map();
      this.errorHandlers.set(handlerId, handlerMap);
    }
    const handlers = handlerMap.get(errorType);
    if (handlers) handlers.push(handler);
    else handlerMap.set(errorType, [handler]);
  }

  unregister(handlerId: string, errorType: string, handler: ErrorHandler<any>): void {
    const handlerMap = this.errorHandlers.get(handlerId);
    const handlers = handlerMap?.get(errorType);
    if (!handlerMap || !handlers) return;
    removeFrom(handlers, handler);
    if (!handlers.length) handlerMap.delete(errorType);
    if (handlerMap.size === 0) this.errorHandlers.delete(handlerId);
  }

  hasHandler(handlerId: string, errorType: string): boolean {
    const handlerMap = this.errorHandlers.get(handlerId);
    return handlerMap?.has(errorType) ?? false;
  }

  /** A copy, so a handler that adds or removes one leaves this run unchanged */
  getErrorHandlers(handlerId: string, errorType: string): ErrorHandler<any>[] {
    return [...(this.errorHandlers.get(handlerId)?.get(errorType) ?? [])];
  }

  registerResponse(handlerId: string, handler: ResponseHandler<any>): void {
    const handlers = this.responseHandlers.get(handlerId);
    if (handlers) handlers.push(handler);
    else this.responseHandlers.set(handlerId, [handler]);
  }

  unregisterResponse(handlerId: string, handler: ResponseHandler<any>): void {
    const handlers = this.responseHandlers.get(handlerId);
    if (!handlers) return;
    removeFrom(handlers, handler);
    if (!handlers.length) this.responseHandlers.delete(handlerId);
  }

  hasResponseHandler(handlerId: string): boolean {
    return this.responseHandlers.has(handlerId);
  }

  /** A copy, so a handler that adds or removes one leaves this run unchanged */
  getResponseHandlers(handlerId: string): ResponseHandler<any>[] {
    return [...(this.responseHandlers.get(handlerId) ?? [])];
  }

  registerRequest(
    handlerId: string,
    handler: RequestHandler<any>,
    createSubRequest: RequestHandlerEntry['createSubRequest']
  ): void {
    const owner = this.requestHandlers.get(handlerId)?.owner;
    // replacing an installer's hook would silently break it
    if (owner)
      throw new Error(`Middleware '${handlerId}' gets its onRequest from ${owner}, call offRequest() first to replace it`);
    this.requestHandlers.set(handlerId, {handler, createSubRequest});
  }

  /** A later onRequest then throws instead of replacing the installer's hook */
  setRequestOwner(handlerId: string, owner: string): void {
    const entry = this.requestHandlers.get(handlerId);
    if (entry) entry.owner = owner;
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

/** A handler registered twice needs two removals */
function removeFrom<H>(handlers: H[], handler: H): void {
  const index = handlers.indexOf(handler);
  if (index !== -1) handlers.splice(index, 1);
}
