/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, RpcError, SerializableMethodsData} from '@mionjs/core';
import type {MethodsMetadataByIdHandler, MethodsMetadataHandler} from '@mionjs/core/middlewares';
import {
  getMiddlewareExecutable,
  getRouteExecutable,
  getRouterOptions,
  getTotalExecutables,
  getAllExecutablesIds,
  getAnyExecutable,
} from '../router.ts';
import {markOnDemand, markStandalone, middleware, route} from '../lib/handlers.ts';
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

/** With getAllRemoteMethods, answers with every public method instead of the given ids. */
function methodsMetadataById(
  ctx: CallContext,
  methodsIds: string[],
  getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> {
  const resp: SerializableMethodsData = {
    methods: {},
    deps: {},
    purFnDeps: {},
  };
  const errorData = {};
  const maxMethods =
    getRouterOptions<MethodsMetadataOptions>().getAllRemoteMethodsMaxNumber || DEFAULT_ALL_REMOTE_METHODS_MAX_NUMBER;
  const shouldReturnAll = getAllRemoteMethods && getTotalExecutables() <= maxMethods;
  const idsToReturn = shouldReturnAll
    ? getAllExecutablesIds().filter(
        (id) => !mionInternalRouteIds.has(id) && isPublicExecutable(getAnyExecutable(id) as RemoteMethod)
      )
    : methodsIds;
  idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData));
  // A hand-written client can only send ids the build compiled in, so list them alongside the methods
  if (shouldReturnAll) resp.batches = getBatchIds();

  if (Object.keys(errorData).length)
    return new RpcError({
      type: 'rpc-metadata-not-found',
      publicMessage: 'Errors getting Remote Methods Metadata',
      errorData,
    });
  return resp;
}

function methodsMetadata(
  ctx: CallContext,
  methodsIds?: string[],
  getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void {
  if (!methodsIds || methodsIds.length === 0) return;
  return methodsMetadataById(ctx, methodsIds, getAllRemoteMethods);
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

// Spread first in the routes; keep both keys, the client finds the route next to the middleware.
// Both pin the built-in parser: a client asks before it knows any strategy.
// In every chain with an unbounded `string[]`, so maxBodySize is a fixed share of each limit: room for a first call's ids.
export const mionMethodsMetadata = {
  mionMethodsMetadata: markOnDemand(
    middleware(methodsMetadata satisfies MethodsMetadataHandler, {
      alwaysRun: true,
      parser: {params: 'clone', return: 'clone'},
      maxBodySize: 4096,
    })
  ),
  // asked before the client knows any middleware's params, so none of yours run on it (as `typeErrors()` sends none)
  mionMethodsMetadataById: markStandalone(route(methodsMetadataById satisfies MethodsMetadataByIdHandler, {parser: 'clone'})),
} as const;
