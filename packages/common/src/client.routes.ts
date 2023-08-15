/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH, Obj, RpcError} from '@mionkit/core';
import {
    RemoteMethodMetadata,
    getHookExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getMethodmetadataFromExecutable,
    getRouteExecutionPath,
    Routes,
    getRouterOptions,
    RouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
    Executable,
} from '@mionkit/router';

export type RemoteMethodsDictionary = {[key: string]: RemoteMethodMetadata};
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

function addRequiredRemoteMethodsToResponse(id: string, resp: RemoteMethodsDictionary, errorData: Obj): void {
    if (resp[id]) return;
    const executable = getHookExecutable(id) || getRouteExecutable(id);
    if (!executable) {
        errorData[id] = `Remote Method ${id} not found`;
        return;
    }
    if (isPrivateExecutable(executable)) return;

    resp[id] = getMethodmetadataFromExecutable(executable);
    resp[id].hookIds?.forEach((hookId) => addRequiredRemoteMethodsToResponse(hookId, resp, errorData));
}

export const getRemoteMethods = (
    ctx,
    methodsIds: string[],
    getAllRemoteMethods?: boolean
): RemoteMethodsDictionary | RpcError => {
    const resp: RemoteMethodsDictionary = {};
    const errorData = {};
    const maxMethods =
        getRouterOptions<ClientRouteOptions>().getAllRemoteMethodsMaxNumber ||
        defaultClientRouteOptions.getAllRemoteMethodsMaxNumber;
    const shouldReturnAll = getAllRemoteMethods && getTotalExecutables() <= maxMethods;
    const idsToReturn = shouldReturnAll
        ? getAllExecutablesIds().filter(
              (id) =>
                  id !== GET_REMOTE_METHODS_BY_ID &&
                  id !== GET_REMOTE_METHODS_BY_PATH &&
                  !isPrivateExecutable(getAnyExecutable(id) as Executable)
          )
        : methodsIds;
    idsToReturn.forEach((id) => addRequiredRemoteMethodsToResponse(id, resp, errorData));

    if (Object.keys(errorData).length)
        return new RpcError({
            statusCode: 404,
            name: 'Invalid Metadata Request',
            publicMessage: 'Errors getting Remote Methods Metadata',
            errorData,
        });
    return resp;
};

export const getRouteRemoteMethods = (ctx, path: string, getAllRemoteMethods?: boolean): RemoteMethodsDictionary | RpcError => {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new RpcError({
            statusCode: 404,
            name: 'Invalid Metadata Request',
            publicMessage: `Route ${path} not found`,
        });
    const privateExecutables = executables.filter((e) => !isPrivateExecutable(e));
    return getRemoteMethods(
        ctx,
        privateExecutables.map((e) => e.id),
        getAllRemoteMethods
    );
};

export const clientRoutes = {
    [GET_REMOTE_METHODS_BY_ID]: {
        // disable serialization as deserializer seems ti ignore serializedTypes
        enableSerialization: false,
        route: getRemoteMethods,
    },
    [GET_REMOTE_METHODS_BY_PATH]: {
        enableSerialization: false,
        // disable serialization as deserializer seems ti ignore serializedTypes
        route: getRouteRemoteMethods,
    },
} satisfies Routes;
