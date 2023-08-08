/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH, PublicError} from '@mionkit/core';
import {
    RemoteMethod,
    getHookExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getRemoteMethodFromExecutable,
    getRouteExecutionPath,
    Routes,
    getRouterOptions,
    RouterOptions,
    getTotalExecutables,
    getAllExecutablesIds,
    getAnyExecutable,
    Executable,
} from '@mionkit/router';

export type RemoteMethodsDictionary = {[key: string]: RemoteMethod};
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

export const getRemoteMethods = (
    ctx,
    methodsIds: string[],
    getAllRemoteMethods?: boolean
): RemoteMethodsDictionary | PublicError => {
    const resp: RemoteMethodsDictionary = {};
    const errorData = {};
    let hasErrors = false;
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
    idsToReturn.forEach((id) => {
        const executable = getHookExecutable(id) || getRouteExecutable(id);
        if (!executable || isPrivateExecutable(executable)) {
            errorData[id] = `Remote Method ${id} not found`;
            hasErrors = true;
            return;
        }
        resp[id] = getRemoteMethodFromExecutable(executable);
    });

    if (hasErrors)
        return new PublicError({
            statusCode: 404,
            name: 'Invalid RemoteMethods Request',
            message: 'RemoteMethods not found',
            errorData,
        });
    return resp;
};

export const getRouteRemoteMethods = (
    ctx,
    path: string,
    getAllRemoteMethods?: boolean
): RemoteMethodsDictionary | PublicError => {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new PublicError({statusCode: 404, name: 'Invalid RemoteMethods Request', message: `Route ${path} not found`});
    const privateExecutables = executables.filter((e) => !isPrivateExecutable(e));
    return getRemoteMethods(
        ctx,
        privateExecutables.map((e) => e.id),
        getAllRemoteMethods
    );
};

export const clientRoutes = {
    [GET_REMOTE_METHODS_BY_ID]: {
        // disable serialization as deserializer seems ti ignore handlerSerializedType
        enableSerialization: false,
        route: getRemoteMethods,
    },
    [GET_REMOTE_METHODS_BY_PATH]: {
        enableSerialization: false,
        // disable serialization as deserializer seems ti ignore handlerSerializedType
        route: getRouteRemoteMethods,
    },
} satisfies Routes;
