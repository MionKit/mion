/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {RpcError} from '@mionjs/core';
import {inputMapperKey} from '@mionjs/core';
import type {PureFunction, InjectPureFnHash, InjectBatchId} from '@mionjs/run-types';
import type {MiddlewareSubRequest, RouteSubRequest, BatchBuilder, SubRequest} from './types.ts';
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
    async call(setup?: {middleFns?: Record<string, MiddlewareSubRequest<any>>; signal?: AbortSignal; timeout?: number}) {
      const middleFns = setup?.middleFns ?? {};
      const [results, errors, fatal, middleFnResults, middleFnErrors] = await client.execute(
        undefined,
        routes as any,
        batchId,
        middleFns as any,
        setup?.signal,
        setup?.timeout
      );
      const emptyResults = routes.map(() => undefined);
      const emptyErrors = routes.map(() => undefined);
      return [results ?? emptyResults, errors ?? emptyErrors, fatal, middleFnResults, middleFnErrors] as any;
    },
  };
}

const inputFromSymbol = Symbol('InputFromRef');

/**
 * Feeds the output of one route SubRequest into the input of another within a batch. The mapper
 * EXECUTES ON THE SERVER, which only runs functions its own build baked in; the batch table the
 * build compiled into the server carries the mapper key, so nothing about the mapper travels.
 *
 * TWO call shapes:
 * - INLINE (vite / next builds): `inputFrom(order, (o) => o.userId)`. The mion preset extracts the
 *   mapper at build time (PureFunction/InjectPureFnHash markers), content-hashes it
 *   (`mapperKey = 'rt::<hash>'`) and ships the body to the server bundle through the batches manifest.
 * - BY NAME: `inputFrom(order, 'toUserId')` references a mapper the server registered itself under
 *   `mionjs::<name>`, with RunTypes' `registerPureFn` plus an `allowInputMapper()` call.
 */
export function inputFrom<FromSR extends SubRequest<any>, MappedInput = any>(
  source: FromSR,
  fnName: string
): InputFromRef<(value: FromSR['resolvedValue']) => MappedInput>;
export function inputFrom<FromSR extends SubRequest<any>, MappedInput = any>(
  source: FromSR,
  mapper: PureFunction<(value: FromSR['resolvedValue']) => MappedInput>,
  hash?: InjectPureFnHash<(value: FromSR['resolvedValue']) => MappedInput>
): InputFromRef<(value: FromSR['resolvedValue']) => MappedInput>;
export function inputFrom<FromSR extends SubRequest<any>, MappedInput = any>(
  source: FromSR,
  mapperOrName: unknown,
  hash?: string
): InputFromRef<(value: FromSR['resolvedValue']) => MappedInput> {
  const isNameLane = typeof mapperOrName === 'string';
  if (isNameLane && !mapperOrName)
    throw new Error('inputFrom() requires a mapper function or the name of a server-registered mion pure fn');
  if (!isNameLane && !hash)
    throw new Error(
      'inputFrom() with an inline mapper requires the mion build plugin (no pure-fn hash was injected at build time). ' +
        'Without the build pass the name of a server-registered mion pure fn instead.'
    );
  // The 3rd param is string-typed, so a plain name there still typechecks but the plugin never
  // overrides an explicit 3rd arg: reject it loudly instead of sending a key no server resolves.
  if (!isNameLane && !(hash as string).includes('::'))
    throw new Error(
      `inputFrom() got a plain name ('${hash}') in the 3rd argument. ` +
        `Pass the name as the 2nd argument instead: inputFrom(source, '${hash}').`
    );
  // full registry key: 'mionjs::<name>' (name lane) | injected 'rt::<hash>' (inline lane)
  const mapperKey = isNameLane ? inputMapperKey(mapperOrName as string) : (hash as string);
  const sep = mapperKey.indexOf('::');
  const ref = {
    inputFromSymbol,
    namespace: mapperKey.slice(0, sep),
    fnName: mapperKey.slice(sep + 2),
    mapperKey,
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
