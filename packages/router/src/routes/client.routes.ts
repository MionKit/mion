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
    isPrivateExecutable,
    getRouteExecutionChain,
    getRouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
} from '../router.ts';
import {route} from '../lib/handlers.ts';
import {RouterOptions, Routes} from '../types/general.ts';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods.ts';
import {RemoteMethod} from '../types/remoteMethods.ts';

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

/**
 * Returns the metadata for the given route path.
 * This include all middleFns in the ExecutionChain of the route.
 * If getAllRemoteMethods is true, all public methods and middleFns are returned.
 * @mion:route
 */
function mionGetRemoteMethodsDataByPath(
    ctx,
    path: string,
    getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> {
    const executables = getRouteExecutionChain(path);
    if (!executables)
        return new RpcError({
            type: 'rpc-metadata-not-found',
            publicMessage: `Route ${path} not found`,
        });
    const privateExecutables = executables.methods.filter((e) => !isPrivateExecutable(e));
    return mionGetRemoteMethodsDataById(
        ctx,
        privateExecutables.map((e) => e.id),
        getAllRemoteMethods
    );
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

export const mionClientRoutes = {
    // Client routes always use stringifyJson serialization to avoid mutating data as is cached
    // These routes are used by the client to fetch metadata and must work regardless of router's default serialization
    [MION_ROUTES.methodsMetadataById]: route(mionGetRemoteMethodsDataById, {serializer: 'stringifyJson'}),
    [MION_ROUTES.methodsMetadataByPath]: route(mionGetRemoteMethodsDataByPath, {serializer: 'stringifyJson'}),
} as const satisfies Routes;
