/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {FatalError, RpcError, SerializableMethodsData, StatusCodes} from '@mionjs/core';
import type {FetchMetadataHandler, FetchMetadataMode, FetchMetadataOnlyData} from '@mionjs/core/middlewares';
import {
  getMiddlewareExecutable,
  getRouteExecutable,
  getRouterOptions,
  getTotalExecutables,
  getAllExecutablesIds,
  getAnyExecutable,
} from '../router.ts';
import {markOnDemand, middleware, mionInternalRouteIds} from '../lib/handlers.ts';
import {isPublicExecutable} from '../types/guards.ts';
import {getBatchIds} from '../batches.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {CallContext} from '../types/context.ts';

/** Rows alongside the call; with a mode, rows alone and the call stopped before its route runs. */
function fetchMetadata(ctx: CallContext, methodsIds?: string[], mode?: FetchMetadataMode): ReturnType<FetchMetadataHandler> {
  if (mode) {
    return new FatalError<'metadata-only', FetchMetadataOnlyData>({
      type: 'metadata-only',
      publicMessage: 'Route metadata only: the call was stopped before its route.',
      errorData: rowsFor(methodsIds ?? [], mode === 'all'),
      // an answer, not a failure: access logs and monitoring count it as a success
      statusCode: StatusCodes.OK,
    });
  }
  if (!methodsIds || methodsIds.length === 0) return;
  const {metadata, notFound} = rowsFor(methodsIds, false);
  if (notFound)
    return new RpcError({
      type: 'rpc-metadata-not-found',
      publicMessage: 'Errors getting Remote Methods Metadata',
      errorData: notFound,
    });
  return metadata;
}

/** With `all`, every public method instead of the given ids, plus the batch ids. */
function rowsFor(methodsIds: string[], all: boolean): FetchMetadataOnlyData {
  const metadata: SerializableMethodsData = {methods: {}, deps: {}, purFnDeps: {}};
  const notFound: Record<string, string> = {};
  const shouldReturnAll = all && getTotalExecutables() <= getRouterOptions().getAllRemoteMethodsMaxNumber;
  const idsToReturn = shouldReturnAll
    ? getAllExecutablesIds().filter(
        (id) => !mionInternalRouteIds.has(id) && isPublicExecutable(getAnyExecutable(id) as RemoteMethod)
      )
    : methodsIds;
  idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, metadata, notFound));
  // A hand-written client can only send ids the build compiled in, so list them alongside the methods
  if (shouldReturnAll) metadata.batches = getBatchIds();
  const answer: FetchMetadataOnlyData = {metadata};
  if (Object.keys(notFound).length) answer.notFound = notFound;
  if (all && !shouldReturnAll) answer.truncated = true;
  return answer;
}

/** The rows of the given methods and of their chains; an unknown id is left out. */
export function getMethodsDataFor(ids: string[]): SerializableMethodsData {
  return rowsFor(ids, false).metadata;
}

function addRequiredRemoteMethodsToResponse(id: string, resp: SerializableMethodsData, errorData: Record<string, string>): void {
  const {methods, deps, purFnDeps} = resp;
  if (methods[id]) return;
  if (mionInternalRouteIds.has(id)) return;
  const executable = getMiddlewareExecutable(id) || getRouteExecutable(id);
  if (!executable) {
    errorData[id] = `Remote Method ${id} not found`;
    return;
  }
  if (!isPublicExecutable(executable)) return;
  const method = getSerializableMethod(executable as RemoteMethod);
  methods[id] = method;
  method.middlewareIds?.forEach((middlewareId) => addRequiredRemoteMethodsToResponse(middlewareId, resp, errorData));
  serializeMethodDeps(method, deps, purFnDeps);
}

// Place it at the root, before any route: its `only` and `all` modes must stop the chain before the route.
// Pins the built-in parser: a client asks before it knows any strategy.
// In every chain with an unbounded `string[]`, so maxBodySize is a fixed share of each limit: room for a first call's ids.
export const mionFetchMetadata = markOnDemand(
  middleware(fetchMetadata satisfies FetchMetadataHandler, {
    alwaysRun: true,
    parser: {params: 'clone', return: 'clone'},
    maxBodySize: 4096,
  })
);
