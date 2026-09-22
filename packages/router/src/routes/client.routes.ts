/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, RpcError, MION_ROUTES, SerializableMethodsData} from '@mionjs/core';
import type {MethodIdCheck} from '@mionjs/core';
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

/** With getAllRemoteMethods, answers with every public method instead of the given ids.
 * @mion:route
 */
function mionGetRemoteMethodsDataById(
  ctx,
  methodsIds: string[],
  getAllRemoteMethods?: boolean,
  knownIds?: MethodIdCheck[]
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
  const unchanged = unchangedIds(knownIds);
  idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData, unchanged));
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
  getAllRemoteMethods?: boolean,
  knownIds?: MethodIdCheck[]
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> | void {
  if (!methodsIds || methodsIds.length === 0) return;
  return mionGetRemoteMethodsDataById(ctx, methodsIds, getAllRemoteMethods, knownIds);
}

/** The ids whose compiled types the client already holds. An id the server no longer declares is absent
 *  here, so it still reaches the not-found answer. */
function unchangedIds(knownIds: MethodIdCheck[] | undefined): Set<string> | undefined {
  if (!knownIds?.length) return undefined;
  const unchanged = new Set<string>();
  for (const known of knownIds) {
    const executable = getAnyExecutable(known.id) as RemoteMethod | undefined;
    if (executable?.paramsJitHash === known.paramsId && executable?.returnJitHash === known.returnId) unchanged.add(known.id);
  }
  return unchanged;
}

function addRequiredRemoteMethodsToResponse(
  id: string,
  resp: SerializableMethodsData,
  errorData: AnyObject,
  unchanged?: Set<string>
): void {
  const {methods, deps, purFnDeps} = resp;
  if (methods[id]) return;
  if (mionInternalRoutes.includes(id)) return;
  if (unchanged?.has(id)) return;
  const executable = getMiddleFnExecutable(id) || getRouteExecutable(id);
  if (!executable) {
    errorData[id] = `Remote Method ${id} not found`;
    return;
  }
  if (!hasClientMetadata(executable)) return;
  const method = getSerializableMethod(executable as RemoteMethod);
  methods[id] = method;
  method.middleFnIds?.forEach((middleFnId) => addRequiredRemoteMethodsToResponse(middleFnId, resp, errorData, unchanged));
  serializeMethodDeps(method, deps, purFnDeps);
}

/** The metadata middleFn sits in EVERY chain, so an absent slot skips the whole params pipeline
 *  (decode, sanitize, validate, call) instead of running it to return undefined. Identical answer:
 *  both params are optional. A slot that IS present takes the normal path, validation included. */
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
  // against the default whatever the router-wide parser is. It never mutates the cached metadata.
  // It sits in EVERY chain with an unbounded `string[]`, so maxBodySize pins a fixed contribution to each
  // chain's limit: room for the ids a client piggybacks on its first call, not the platform's number.
  [MION_ROUTES.methodsMetadata]: middleFn(mionMethodsMetadata, {
    alwaysRun: true,
    parser: {params: 'clone', return: 'clone'},
    maxBodySize: 4096,
  }),
} as const satisfies MiddleFnsCollection;

export const mionClientRoutes = {
  // Pins the built-in default on both wires: the bootstrap request arrives before the client knows
  // any strategy, so this route must not follow the router-wide one.
  [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {parser: 'clone'}),
} as const satisfies Routes;
