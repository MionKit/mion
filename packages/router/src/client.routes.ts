/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH, AnyObject, RpcError} from '@mionkit/core';
import {
    getHookExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
} from './router';
// TODO: investigate why compilation fails if route gets imported from @mionkit/router rather that relative import
import {route} from './initFunctions';
import {PublicProcedure} from './types/publicProcedures';
import {RouterOptions, Routes} from './types/general';
import {getMethodMetadataFromExecutable} from './remoteMethodsMetadata';
import {Procedure} from './types/procedures';

export type RemoteMethodsDictionary = {[key: string]: PublicProcedure};
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

function addRequiredRemoteMethodsToResponse(id: string, resp: RemoteMethodsDictionary, errorData: AnyObject): void {
    if (resp[id]) return;
    const executable = getHookExecutable(id) || getRouteExecutable(id);
    if (!executable) {
        errorData[id] = `Remote Method ${id} not found`;
        return;
    }
    if (isPrivateExecutable(executable)) return;

    resp[id] = getMethodMetadataFromExecutable(executable);
    resp[id].hookIds?.forEach((hookId) => addRequiredRemoteMethodsToResponse(hookId, resp, errorData));
}

const getRemoteMethods = (
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
                  !isPrivateExecutable(getAnyExecutable(id) as Procedure)
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

const getRouteRemoteMethods = (ctx, path: string, getAllRemoteMethods?: boolean): RemoteMethodsDictionary | RpcError => {
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

// disable serialization as deserializer seems to ignore serializedTypes
const routerOpts = {useSerialization: false};
export const clientRoutes = {
    [GET_REMOTE_METHODS_BY_ID]: route(getRemoteMethods, routerOpts),
    [GET_REMOTE_METHODS_BY_PATH]: route(getRouteRemoteMethods, routerOpts),
} satisfies Routes;
