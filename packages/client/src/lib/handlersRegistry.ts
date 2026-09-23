/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {RpcError} from '@mionjs/core';
import type {ErrorHandler, SuccessHandler} from '../types.ts';

/** Central registry for persistent middleware handlers (both success and error) */
export class HandlersRegistry {
  private errorHandlers: Map<string, Map<string, ErrorHandler<any>>> = new Map();
  private successHandlers: Map<string, SuccessHandler<any>> = new Map();

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

  executeHandler(handlerId: string, error: RpcError<string>): boolean {
    const handlerMap = this.errorHandlers.get(handlerId);
    if (!handlerMap) return false;

    const handler = handlerMap.get(error.type);
    if (!handler) return false;

    handler(error);
    return true;
  }

  registerSuccess(handlerId: string, handler: SuccessHandler<any>): void {
    this.successHandlers.set(handlerId, handler);
  }

  unregisterSuccess(handlerId: string): void {
    this.successHandlers.delete(handlerId);
  }

  hasSuccessHandler(handlerId: string): boolean {
    return this.successHandlers.has(handlerId);
  }

  executeSuccessHandler(handlerId: string, result: any): boolean {
    const handler = this.successHandlers.get(handlerId);
    if (!handler) return false;

    handler(result);
    return true;
  }

  clearHandlers(handlerId: string): void {
    this.errorHandlers.delete(handlerId);
    this.successHandlers.delete(handlerId);
  }

  clearAll(): void {
    this.errorHandlers.clear();
    this.successHandlers.clear();
  }

  getHandlerIds(): string[] {
    const errorIds = Array.from(this.errorHandlers.keys());
    const successIds = Array.from(this.successHandlers.keys());
    return [...new Set([...errorIds, ...successIds])];
  }

  getErrorTypes(handlerId: string): string[] {
    const handlerMap = this.errorHandlers.get(handlerId);
    return handlerMap ? Array.from(handlerMap.keys()) : [];
  }
}
