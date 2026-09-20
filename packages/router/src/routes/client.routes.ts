/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, RpcError, MION_ROUTES, SerializableMethodsData} from '@mionjs/core';
import {
  getMiddleFnExecutable,
  getRouteExecutable,
  hasClientMetadata,
  getRouterOptions,
  getTotalExecutables,
  getAllExecutablesIds,
  getAnyExecutable,
} from '../router.ts';
import {middleFn, route} from '../lib/handlers.ts';
import {callerForType} from '../dispatch.ts';
import {HandlerType} from '@mionjs/core';
import {getBatchIds} from '../batches.ts';
import {RouterOptions, Routes} from '../types/general.ts';
import {MiddleFnsCollection} from '../types/publicMethods.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {CallContext, MionRequest} from '../types/context.ts';

export interface ClientRouteOptions extends RouterOptions {
  getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
  getAllRemoteMethodsMaxNumber: 100,
};

// Internal mion routes that should not be exposed to clients
const mionInternalRoutes = Object.values(MION_ROUTES) as string[];

/**
 * Returns the metadata for the given method ids.
 * If getAllRemoteMethods is true, all public methods and middleFns are returned.
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
        (id) => !mionInternalRoutes.includes(id) && hasClientMetadata(getAnyExecutable(id) as RemoteMethod)
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

/** Middleware wrapper: delegates to mionGetRemoteMethodsDataById when params are provided */
function mionMethodsMetadata(
  ctx: CallContext,
  methodsIds?: string[],
  getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void {
  if (!methodsIds || methodsIds.length === 0) return;
  return mionGetRemoteMethodsDataById(ctx, methodsIds, getAllRemoteMethods);
}

function addRequiredRemoteMethodsToResponse(id: string, resp: SerializableMethodsData, errorData: AnyObject): void {
  const {methods, deps, purFnDeps} = resp;
  if (methods[id]) return;
  if (mionInternalRoutes.includes(id)) return;
  const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
  if (!executable) {
    errorData[id] = `Remote Method ${id} not found`;
    return;
  }
  if (!hasClientMetadata(executable)) return;
  const method = getSerializableMethod(executable as RemoteMethod);
  methods[id] = method;
  method.middleFnIds?.forEach((middleFnId) => addRequiredRemoteMethodsToResponse(middleFnId, resp, errorData));
  serializeMethodDeps(method, deps, purFnDeps);
}

/** The metadata middleFn sits in EVERY chain but can only answer when a client actually asked for
 *  metadata. Without this it ran its whole params pipeline (decode, sanitize, validate, spread call)
 *  on every request for a slot that is not there, only to reach its own `return` and hand back
 *  undefined. Skipping is the identical answer: both of its params are optional, so an absent slot
 *  means the handler is called with no arguments and returns undefined either way. A slot that IS
 *  present takes the normal path, validation included. */
const callMiddleFn = callerForType(HandlerType.middleFn);
function runMethodsMetadataOnDemand(
  context: CallContext,
  executable: RemoteMethod,
  request: MionRequest,
  ...rest: unknown[]
): unknown {
  if (request.body[executable.id] === undefined) return undefined;
  return callMiddleFn(context, executable, request, ...rest);
}

/** Assigned once the metadata middleFn is registered, so the chain reads it like any other caller. */
export function useOnDemandMetadataCaller(executable: RemoteMethod): void {
  executable.methodCaller = runMethodsMetadataOnDemand;
}

export const mionClientMiddleFns = {
  // Pins the built-in default on BOTH directions: declared at module level, so the build compiles it
  // against the default whatever the router-wide serializer is. It never mutates the cached metadata.
  // It sits in EVERY chain and takes an unbounded `string[]`, so maxBodySize is a fixed contribution to
  // each chain's limit: room for the ids a client piggybacks on its first call, not the platform's number.
  [MION_ROUTES.methodsMetadata]: middleFn(mionMethodsMetadata, {
    alwaysRun: true,
    serializer: {params: 'clone', return: 'clone'},
    maxBodySize: 4096,
  }),
} as const satisfies MiddleFnsCollection;

export const mionClientRoutes = {
  // Pins the built-in default on both wires: the bootstrap request arrives before the client knows
  // any strategy, so this route must not follow the router-wide one.
  [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {serializer: 'clone'}),
} as const satisfies Routes;
