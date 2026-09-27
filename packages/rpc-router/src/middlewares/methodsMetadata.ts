/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, FatalError, RpcError, SerializableMethodsData} from '@mionjs/core';
import type {
  MethodsMetadataHandler,
  MethodsMetadataMode,
  MethodsMetadataOnly,
  MethodsMetadataOnlyData,
} from '@mionjs/core/middlewares';
import {
  getMiddlewareExecutable,
  getRouteExecutable,
  getRouterOptions,
  getTotalExecutables,
  getAllExecutablesIds,
  getAnyExecutable,
} from '../router.ts';
import {markOnDemand, middleware} from '../lib/handlers.ts';
import {isPublicExecutable} from '../types/guards.ts';
import {getBatchIds} from '../batches.ts';
import {RouterOptions} from '../types/general.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {CallContext} from '../types/context.ts';
import {mionInternalRouteIds} from '../constants.ts';

export interface MethodsMetadataOptions extends RouterOptions {
  getAllRemoteMethodsMaxNumber?: number;
}

const DEFAULT_ALL_REMOTE_METHODS_MAX_NUMBER = 100;

/** Rows alongside the call; with a mode, rows alone and the call stopped before its route runs. */
function methodsMetadata(
  ctx: CallContext,
  methodsIds?: string[],
  mode?: MethodsMetadataMode
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | MethodsMetadataOnly | void {
  if (mode) {
    const {metadata, notFound} = rowsFor(methodsIds ?? [], mode === 'all');
    return new FatalError<'metadata-only', MethodsMetadataOnlyData>({
      type: 'metadata-only',
      publicMessage: 'Route metadata only: the call was stopped before its route.',
      errorData: notFound ? {metadata, notFound} : {metadata},
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
function rowsFor(methodsIds: string[], all: boolean): {metadata: SerializableMethodsData; notFound?: Record<string, string>} {
  const metadata: SerializableMethodsData = {methods: {}, deps: {}, purFnDeps: {}};
  const notFound: Record<string, string> = {};
  const maxMethods =
    getRouterOptions<MethodsMetadataOptions>().getAllRemoteMethodsMaxNumber || DEFAULT_ALL_REMOTE_METHODS_MAX_NUMBER;
  const shouldReturnAll = all && getTotalExecutables() <= maxMethods;
  const idsToReturn = shouldReturnAll
    ? getAllExecutablesIds().filter(
        (id) => !mionInternalRouteIds.has(id) && isPublicExecutable(getAnyExecutable(id) as RemoteMethod)
      )
    : methodsIds;
  idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, metadata, notFound));
  // A hand-written client can only send ids the build compiled in, so list them alongside the methods
  if (shouldReturnAll) metadata.batches = getBatchIds();
  return Object.keys(notFound).length ? {metadata, notFound} : {metadata};
}

/** The rows of the given methods and of their chains; an unknown id is left out. */
export function getMethodsDataFor(ids: string[]): SerializableMethodsData {
  const resp: SerializableMethodsData = {methods: {}, deps: {}, purFnDeps: {}};
  ids.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, {}));
  return resp;
}

function addRequiredRemoteMethodsToResponse(id: string, resp: SerializableMethodsData, errorData: AnyObject): void {
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

// Place it at the root, before any route: in `only` or `all` mode it stops the chain, which must happen before the route.
// Pins the built-in parser: a client asks before it knows any strategy.
// In every chain with an unbounded `string[]`, so maxBodySize is a fixed share of each limit: room for a first call's ids.
export const mionMethodsMetadata = markOnDemand(
  middleware(methodsMetadata satisfies MethodsMetadataHandler, {
    alwaysRun: true,
    parser: {params: 'clone', return: 'clone'},
    maxBodySize: 4096,
  })
);
