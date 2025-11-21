/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, JitCompiledFnData, PureFunctionData} from '@mionkit/core';
import {RpcError} from '@mionkit/core';
import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH} from '@mionkit/core';
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
import {route} from './handlers';
import {PublicMethod} from './types/publicMethods';
import {RouterOptions, Routes} from './types/general';
import {getSerializableMethod, serializeMethodDeps} from './remoteMethods';
import {Method} from './types/remoteMethods';

// TODO, investigate if we can use SharedPublicMethod that do not include the handler instead of PublicMethod
export type PublicMethods = Record<string, PublicMethod>;
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export interface MethodsData {
    methods: PublicMethods;
    deps: Record<string, JitCompiledFnData>;
    purFnDeps: Record<string, PureFunctionData>;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

function addRequiredRemoteMethodsToResponse(id: string, resp: MethodsData, errorData: AnyObject): void {
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

const mionGetRemoteMethodsInfoById = (
    ctx,
    methodsIds: string[],
    getAllRemoteMethods?: boolean
): MethodsData | RpcError<'rpc-metadata-not-found'> => {
    const resp: MethodsData = {
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
                  id !== GET_REMOTE_METHODS_BY_ID &&
                  id !== GET_REMOTE_METHODS_BY_PATH &&
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
};

const mionGetRemoteMethodsInfoByPath = (
    ctx,
    path: string,
    getAllRemoteMethods?: boolean
): MethodsData | RpcError<'rpc-metadata-not-found'> => {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new RpcError({
            statusCode: 404,
            type: 'rpc-metadata-not-found',
            publicMessage: `Route ${path} not found`,
        });
    const privateExecutables = executables.methods.filter((e) => !isPrivateExecutable(e));
    return mionGetRemoteMethodsInfoById(
        ctx,
        privateExecutables.map((e) => e.id),
        getAllRemoteMethods
    );
};

export const clientRoutes = {
    // name must match GET_REMOTE_METHODS_BY_ID
    mionGetRemoteMethodsInfoById: route(mionGetRemoteMethodsInfoById),
    // name must match GET_REMOTE_METHODS_BY_PATH
    mionGetRemoteMethodsInfoByPath: route(mionGetRemoteMethodsInfoByPath),
} satisfies Routes;
