/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {RunTypeError} from '@mionjs/core';
import type {CallSetup, MiddlewareSubRequest, RequestErrors, RouteSubRequest, SubRequest} from './types.ts';
import type {InputFromRef} from '@mionjs/core';
import type {MionClient} from './client.ts';
import {TypedEvent} from './lib/typedEvent.ts';
import {isInputFromRef} from './batch.ts';

/** Implementation of both RouteSubRequest and MiddleFnSubRequest interfaces */
export class MionSubRequest<S = any, E extends RpcError<string, any> = any>
  implements RouteSubRequest<any>, MiddlewareSubRequest<any>
{
  pointer: string[];
  id: string;
  isResolved: boolean = false;
  params: any[];
  resolvedValue?: S;
  error?: E;
  serializedParams?: any[];
  mappings: InputFromRef[] = [];

  constructor(
    parentProps: string[],
    handlerId: string,
    argArray: any[],
    readonly client: MionClient
  ) {
    this.pointer = [...parentProps];
    this.id = handlerId;
    this.params = argArray.map((arg, index) => {
      if (isInputFromRef(arg)) {
        arg.toRequestId = this.id;
        arg.paramIndex = index;
        this.mappings.push(arg);
        return null;
      }
      return arg;
    });
  }

  /** Prefills MiddleFn's parameters and returns TypedEvent for event handler registration */
  prefill(): TypedEvent<S, E> {
    this.client.prefill(this as MiddlewareSubRequest<any>).catch((errors: RequestErrors) => {
      console.error('Prefill error:', findSubRequestError(this, errors));
    });

    return this.events();
  }

  /** Returns the TypedEvent for this middleFn so typed handlers can be registered without prefilling */
  events(): TypedEvent<S, E> {
    return new TypedEvent<S, E>(this.id, this.client.handlersRegistry);
  }

  /** Registers a persistent typed error handler for this middleFn, no prefill required */
  onError<T extends E['type']>(errorType: T, handler: (error: Extract<E, {type: T}>) => void): TypedEvent<S, E> {
    return this.events().onError(errorType, handler);
  }

  /** Removes a previously registered error handler */
  offError<T extends E['type']>(errorType: T): TypedEvent<S, E> {
    return this.events().offError(errorType);
  }

  /** Registers a persistent success handler for this middleFn, no prefill required */
  onSuccess(handler: (result: S) => void): TypedEvent<S, E> {
    return this.events().onSuccess(handler);
  }

  /** Removes a previously registered success handler */
  offSuccess(): TypedEvent<S, E> {
    return this.events().offSuccess();
  }

  /** Removes prefilled value and clears any registered error handlers for this middleFn */
  removePrefill(): Promise<void> {
    this.client.handlersRegistry.clearHandlers(this.id);
    return this.client.removePrefill(this as MiddlewareSubRequest<any>);
  }

  /** Calls a remote route with optional setup (middleFns, signal, timeout) */
  call(setup?: CallSetup<any>): Promise<any> {
    return this.client.execute(
      this as unknown as RouteSubRequest<any>,
      undefined,
      undefined,
      setup?.middleFns,
      setup?.signal,
      setup?.timeout
    );
  }

  /** Validates parameters and returns type errors */
  typeErrors(): Promise<RunTypeError[]> {
    return this.client
      .typeErrors(this as SubRequest<any>)
      .catch((errors: RequestErrors) => Promise.reject(findSubRequestError(this, errors)));
  }
}

/** Finds the most relevant error from the errors map for a given sub-request */
export function findSubRequestError(subRequest: SubRequest<any>, errors: RequestErrors): RpcError<string> {
  const specificError = errors.get(subRequest.id);
  if (specificError) return specificError;

  const firstError = errors.values().next().value;
  if (firstError) return firstError;

  return new RpcError({
    type: 'unknown-error',
    publicMessage: 'An unknown error occurred',
  });
}
