/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
import type {CallSetup, RouteSubRequest, BatchBuilder, SubRequest} from './types.ts';
import type {InjectedApiMetadata} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';
import type {InputFromRef} from '@mionjs/core';

/** Runs several routes in ONE HTTP request. The build hashes the ordered route ids into `batchId`, which
 * names the batch in the table it compiled into the server; the request carries only that id. */
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
    async call(setup?: CallSetup, apiMetadata?: InjectedApiMetadata) {
      client.useBundledApi(apiMetadata);
      const [results, errors, undeclared, middlewareResults, middlewareErrors] = await client.execute(
        undefined,
        routes as any,
        batchId,
        setup?.signal,
        setup?.timeout
      );
      const emptyResults = routes.map(() => undefined);
      const emptyErrors = routes.map(() => undefined);
      return [results ?? emptyResults, errors ?? emptyErrors, undeclared, middlewareResults, middlewareErrors] as any;
    },
  };
}

const inputFromSymbol = Symbol('InputFromRef');

/** Feeds the output of one route SubRequest into the input of another within a batch. The mapper EXECUTES
 * ON THE SERVER, which only runs functions its own build baked in, so nothing about the mapper travels: the
 * build extracts the inline mapper, gives the call site its registration id and ships the body in the
 * batches manifest. */
export function inputFrom<FromSR extends SubRequest<any>, MappedInput = any>(
  source: FromSR,
  mapper: PureFunction<(value: FromSR['resolvedValue']) => MappedInput>,
  id?: InjectPureFnId<(value: FromSR['resolvedValue']) => MappedInput>
): InputFromRef<(value: FromSR['resolvedValue']) => MappedInput> {
  // The build rewrites this argument into the mapper's generated entry tuple, not the function the caller
  // wrote. A string is the retired name lane and gets its own message.
  if (typeof mapper === 'string')
    throw new Error('inputFrom() takes the mapper itself, written inline, not the name of a server-registered one.');
  if (mapper == null) throw new Error('inputFrom() requires an inline mapper function');
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
