/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {RunTypeError} from '@mionjs/core';
import type {CallSetup, RequestErrors, RouteSubRequest, SubRequest} from './types.ts';
import type {InjectedApiMetadata} from './types.ts';

import type {InputFromRef} from '@mionjs/core';
import type {MionClient} from './client.ts';
import {isInputFromRef} from './batch.ts';

export class MionSubRequest<S = any, E extends RpcError<string, any> = any> implements RouteSubRequest<any> {
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

  /** `apiMetadata` is filled by the build under `bundleApi`, never by hand. */
  call(setup?: CallSetup, apiMetadata?: InjectedApiMetadata): Promise<any> {
    this.client.useBundledApi(apiMetadata);
    return this.client.execute(this as unknown as RouteSubRequest<any>, undefined, undefined, setup?.signal, setup?.timeout);
  }

  /** `apiMetadata` is filled by the build under `bundleApi`, never by hand. */
  typeErrors(apiMetadata?: InjectedApiMetadata): Promise<RunTypeError[]> {
    this.client.useBundledApi(apiMetadata);
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
