/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, Mutable, RpcError, MION_ROUTES, SerializableMethodsData, SerializerModes} from '@mionjs/core';
import {
    getMiddleFnExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getRouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
} from '../router.ts';
import {middleFn, route} from '../lib/handlers.ts';
import {RouterOptions, Routes} from '../types/general.ts';
import {MiddleFnsCollection} from '../types/publicMethods.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {CallContext, MionResponse} from '../types/context.ts';

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
        getRouterOptions<ClientRouteOptions>().getAllRemoteMethodsMaxNumber ||
        defaultClientRouteOptions.getAllRemoteMethodsMaxNumber;
    const shouldReturnAll = getAllRemoteMethods && getTotalExecutables() <= maxMethods;
    const idsToReturn = shouldReturnAll
        ? getAllExecutablesIds().filter(
              (id) => !mionInternalRoutes.includes(id) && !isPrivateExecutable(getAnyExecutable(id) as RemoteMethod)
          )
        : methodsIds;
    idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData));

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
    // Force JSON serialization so optimistic client can parse the response
    (ctx.response as Mutable<MionResponse>).serializer = SerializerModes.stringifyJson;
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
    if (isPrivateExecutable(executable)) return;
    const method = getSerializableMethod(executable as RemoteMethod);
    methods[id] = method;
    method.middleFnIds?.forEach((middleFnId) => addRequiredRemoteMethodsToResponse(middleFnId, resp, errorData));
    serializeMethodDeps(method, deps, purFnDeps);
}

export const mionClientMiddleFns = {
    [MION_ROUTES.methodsMetadata]: middleFn(mionMethodsMetadata, {runOnError: true}),
} as const satisfies MiddleFnsCollection;

export const mionClientRoutes = {
    // Client routes always use stringifyJson serialization to avoid mutating data as is cached
    // These routes are used by the client to fetch metadata and must work regardless of router's default serialization
    [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {serializer: 'stringifyJson'}),
} as const satisfies Routes;
