/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError, BATCH_KEY_MAPPED_ARG_MARK, BATCH_KEY_ROUTE_SEPARATOR} from '@mionjs/core';
import type {PureFunction, InjectPureFnId, InjectBatchId} from '@mionjs/run-types';
import type {CallSetup, RouteSubRequest, BatchBuilder, SubRequest} from './types.ts';
import type {InjectedApiMetadata} from './types.ts';
import type {MionSubRequest} from './subRequest.ts';
import type {InputFromRef} from '@mionjs/core';

/** Runs several routes in ONE HTTP request carrying only `batchId`, the build's hash of the ordered route ids that
 * names the batch compiled into the server. An item that may be several routes makes one id per combination. */
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
  const id = pickBatchId(routes, batchId);
  if (!id) {
    throw new RpcError({
      type: 'batch-missing-id',
      publicMessage:
        'batch() has no compiled batch for these routes: its route list, or an inputFrom() mapping, could not be ' +
        'determined at compile time, or the mion build plugin (the vite preset or the mion CLI) did not run. ' +
        'Batches are compiled into the server at build time, so only a route list the build can read can be sent.',
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
    // `apiMetadata` is filled by the build when routes are bundled, never by hand
    async call(setup?: CallSetup, apiMetadata?: InjectedApiMetadata) {
      client.useBundledApi(apiMetadata);
      return client.execute(undefined, routes, id, setup?.signal, setup?.timeout);
    },
  };
}

/** Must build the key Go batchLookupKey writes; a route or mapping the build did not read finds no entry. */
function pickBatchId(routes: RouteSubRequest<any>[], batchId: InjectBatchId<unknown> | undefined): string | undefined {
  if (typeof batchId !== 'object') return batchId;
  const key = routes
    .map((route) => route.id + (route.mappings ?? []).map((ref) => BATCH_KEY_MAPPED_ARG_MARK + ref.paramIndex).join(''))
    .join(BATCH_KEY_ROUTE_SEPARATOR);
  return Object.hasOwn(batchId, key) ? batchId[key] : undefined;
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
  // The build rewrites this argument into the mapper's generated entry tuple, not the function the caller wrote.
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
