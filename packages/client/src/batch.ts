/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
import type {MiddlewareSubRequest, RouteSubRequest, BatchBuilder, SubRequest} from './types.ts';
import type {InjectedApiMetadata} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';
import type {InputFromRef} from '@mionjs/core';

/**
 * Creates a BatchBuilder that runs several routes in ONE HTTP request.
 *
 * The build reads every `batch([...])` call site, hashes the ordered route ids into a stable id and
 * fills `batchId`; the same id names the batch in the table the build compiled into the server.
 * The request carries only that id, so a batch the build could not read cannot be sent at all.
 */
export function batch<Routes extends RouteSubRequest<any>[]>(
  routes: [...Routes],
  batchId?: InjectBatchId<Routes>
): BatchBuilder<Routes> {
  if (!routes || routes.length === 0) {
    throw new RpcError({
      type: 'batch-empty-routes',
      publicMessage: 'batch() requires at least one route subrequest.',
    });
  }
  if (!batchId) {
    throw new RpcError({
      type: 'batch-missing-id',
      publicMessage:
        'batch() needs the mion build plugin (vite or next preset) to inject the batch id. ' +
        'Batches are compiled into the server at build time, so a client without the build cannot send one.',
    });
  }

  const firstSubRequest = routes[0] as MionSubRequest;
  if (!firstSubRequest.client) {
    throw new RpcError({
      type: 'batch-missing-client',
      publicMessage: 'Could not extract MionClient from subrequest. Ensure subrequests are created via routes proxy.',
    });
  }

  const client = firstSubRequest.client;

  // Validate all subrequests use the same client instance
  for (let i = 1; i < routes.length; i++) {
    const subRequest = routes[i] as MionSubRequest;
    if (subRequest.client !== client) {
      throw new RpcError({
        type: 'batch-client-mismatch',
        publicMessage: `All subrequests in a batch must use the same client instance. Subrequest at index ${i} has a different client.`,
      });
    }
  }

  return {
    // `apiMetadata` is filled by the build under `bundleApi`, never by hand
    async call(
      setup?: {middleFns?: Record<string, MiddlewareSubRequest<any>>; signal?: AbortSignal; timeout?: number},
      apiMetadata?: InjectedApiMetadata
    ) {
      client.useBundledApi(apiMetadata);
      const middleFns = setup?.middleFns ?? {};
      const [results, errors, undeclared, middleFnResults, middleFnErrors] = await client.execute(
        undefined,
        routes as any,
        batchId,
        middleFns as any,
        setup?.signal,
        setup?.timeout
      );
      const emptyResults = routes.map(() => undefined);
      const emptyErrors = routes.map(() => undefined);
      return [results ?? emptyResults, errors ?? emptyErrors, undeclared, middleFnResults, middleFnErrors] as any;
    },
  };
}

const inputFromSymbol = Symbol('InputFromRef');

/**
 * Feeds the output of one route SubRequest into the input of another within a batch. The mapper
 * EXECUTES ON THE SERVER, which only runs functions its own build baked in; the batch table the
 * build compiled into the server carries the mapper's id, so nothing about the mapper travels.
 *
 * The mapper is written inline: `inputFrom(order, (o) => o.userId)`. The build extracts it
 * (PureFunction/InjectPureFnId markers), gives the call site the id of that registration and ships
 * the body to the server bundle through the batches manifest.
 */
export function inputFrom<FromSR extends SubRequest<any>, MappedInput = any>(
  source: FromSR,
  mapper: PureFunction<(value: FromSR['resolvedValue']) => MappedInput>,
  id?: InjectPureFnId<(value: FromSR['resolvedValue']) => MappedInput>
): InputFromRef<(value: FromSR['resolvedValue']) => MappedInput> {
  if (typeof mapper !== 'function') throw new Error('inputFrom() requires an inline mapper function');
  if (!id)
    throw new Error(
      'inputFrom() requires the mion build plugin: no pure-fn id was injected at build time, ' +
        'so the server has no way to know which mapper to run.'
    );
  const ref = {
    inputFromSymbol,
    mapperKey: id,
    fromRequestId: source.id,
    toRequestId: '',
    paramIndex: -1, // set by MionSubRequest constructor when passed as a parameter
    asArg() {
      return ref as unknown as MappedInput;
    },
  } as unknown as InputFromRef<(value: FromSR['resolvedValue']) => MappedInput>;
  return ref;
}

export function isInputFromRef(ref: any): ref is InputFromRef<any> {
  return ref && ref.inputFromSymbol === inputFromSymbol;
}
