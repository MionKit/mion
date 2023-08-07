/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {PublicError} from '@mionkit/core';
import {
    RemoteMethod,
    getHookExecutable,
    getRouteExecutable,
    isPrivateExecutable,
    getRemoteMethodFromExecutable,
    getRouteExecutionPath,
    Routes,
} from '@mionkit/router';

export type RemoteMethodsDictionary = {[key: string]: RemoteMethod};

export const getRemoteMethods = (ctx, methodsIds: string[]): RemoteMethodsDictionary | PublicError => {
    const resp: RemoteMethodsDictionary = {};
    const errorData = {};
    let hasErrors = false;
    methodsIds.forEach((id) => {
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

export const getRouteRemoteMethods = (ctx, path: string): RemoteMethodsDictionary | PublicError => {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new PublicError({statusCode: 404, name: 'Invalid RemoteMethods Request', message: `Route ${path} not found`});
    const privateExecutables = executables.filter((e) => !isPrivateExecutable(e));
    return getRemoteMethods(
        ctx,
        privateExecutables.map((e) => e.id)
    );
};

export const clientRoutes = {
    mionRemoteMethods: getRemoteMethods,
    mionGetRouteRemoteMethods: getRouteRemoteMethods,
} satisfies Routes;
