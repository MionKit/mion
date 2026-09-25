/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, RpcError, MION_ROUTES, SerializableMethodsData} from '@mionjs/core';
import {
  getMiddlewareExecutable,
  getRouteExecutable,
  getRouterOptions,
  getTotalExecutables,
  getAllExecutablesIds,
  getAnyExecutable,
} from '../router.ts';
import {middleware, route} from '../lib/handlers.ts';
import {isPublicExecutable} from '../types/guards.ts';
import {callerForType} from '../dispatch.ts';
import {HandlerType} from '@mionjs/core';
import {getBatchIds} from '../batches.ts';
import {RouterOptions, Routes} from '../types/general.ts';
import {MiddlewaresCollection} from '../types/publicMethods.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {CallContext, MionRequest} from '../types/context.ts';

export interface ClientRouteOptions extends RouterOptions {
  getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
  getAllRemoteMethodsMaxNumber: 100,
};

// mion's own routes, never exposed to clients
export const mionInternalRouteIds: ReadonlySet<string> = new Set(Object.values(MION_ROUTES));

/** With getAllRemoteMethods, answers with every public method instead of the given ids.
 * @mion:route
 */
function mionGetRemoteMethodsDataById(
  ctx,
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
    getRouterOptions<ClientRouteOptions>().getAllRemoteMethodsMaxNumber || defaultClientRouteOptions.getAllRemoteMethodsMaxNumber;
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

function mionMethodsMetadata(
  ctx: CallContext,
  methodsIds?: string[],
  getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void {
  if (!methodsIds || methodsIds.length === 0) return;
  return mionGetRemoteMethodsDataById(ctx, methodsIds, getAllRemoteMethods);
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

/** The metadata middleware sits in EVERY chain, so an absent slot skips the whole params pipeline
 *  (decode, sanitize, validate, call) instead of running it to return undefined. Identical answer:
 *  both params are optional. A slot that IS present takes the normal path, validation included. */
const callMiddleware = callerForType(HandlerType.middleware);
function runMethodsMetadataOnDemand(
  context: CallContext,
  executable: RemoteMethod,
  request: MionRequest,
  ...rest: unknown[]
): unknown {
  if (request.body[executable.id] === undefined) return undefined;
  return callMiddleware(context, executable, request, ...rest);
}

/** Assigned once the metadata middleware is registered, so the chain reads it like any other caller. */
export function useOnDemandMetadataCaller(executable: RemoteMethod): void {
  executable.methodCaller = runMethodsMetadataOnDemand;
}

export const mionClientMiddlewares = {
  // Pins the built-in default on BOTH directions: declared at module level, so the build compiles it
  // against the default whatever the router-wide parser is. It never mutates the cached metadata.
  // It sits in EVERY chain with an unbounded `string[]`, so maxBodySize pins a fixed contribution to each
  // chain's limit: room for the ids a client piggybacks on its first call, not the platform's number.
  [MION_ROUTES.methodsMetadata]: middleware(mionMethodsMetadata, {
    alwaysRun: true,
    parser: {params: 'clone', return: 'clone'},
    maxBodySize: 4096,
  }),
} as const satisfies MiddlewaresCollection;

export const mionClientRoutes = {
  // Pins the built-in default on both wires: the bootstrap request arrives before the client knows
  // any strategy, so this route must not follow the router-wide one.
  [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {parser: 'clone'}),
} as const satisfies Routes;
