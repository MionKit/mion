/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, RpcError, MION_ROUTES, SerializableMethodsData} from '@mionkit/core';
import {
    getHookExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
} from '../router';
import {route} from '../lib/handlers';
import {RouterOptions, Routes} from '../types/general';
import {getSerializableMethod, serializeMethodDeps} from '../lib/remoteMethods';
import {Method} from '../types/remoteMethods';

// TODO, investigate if we can use SharedPublicMethod that do not include the handler instead of PublicMethod
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

function addRequiredRemoteMethodsToResponse(id: string, resp: SerializableMethodsData, errorData: AnyObject): void {
    const {methods, deps, purFnDeps} = resp;
    if (methods[id]) return;
    const executable = getHookExecutable(id) || getRouteExecutable(id);
    if (!executable) {
        errorData[id] = `Remote Method ${id} not found`;
        return;
    }
    if (isPrivateExecutable(executable)) return;

    const method = getSerializableMethod(executable as Method);
    methods[id] = method;
    method.hookIds?.forEach((hookId) => addRequiredRemoteMethodsToResponse(hookId, resp, errorData));
    serializeMethodDeps(method, deps, purFnDeps);
}

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
              (id) =>
                  id !== MION_ROUTES.getRemoteMethodsById &&
                  id !== MION_ROUTES.getRemoteMethodsByPath &&
                  !isPrivateExecutable(getAnyExecutable(id) as Method)
          )
        : methodsIds;
    idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData));

    if (Object.keys(errorData).length)
        return new RpcError({
            statusCode: 404,
            type: 'rpc-metadata-not-found',
            publicMessage: 'Errors getting Remote Methods Metadata',
            errorData,
        });
    return resp;
}

function mionGetRemoteMethodsDataByPath(
    ctx,
    path: string,
    getAllRemoteMethods?: boolean
): SerializableMethodsData | RpcError<'rpc-metadata-not-found'> {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new RpcError({
            statusCode: 404,
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

export const clientRoutes = {
    [MION_ROUTES.getRemoteMethodsById]: route(mionGetRemoteMethodsDataById),
    [MION_ROUTES.getRemoteMethodsByPath]: route(mionGetRemoteMethodsDataByPath),
} satisfies Routes;
