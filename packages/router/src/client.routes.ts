/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {AnyObject, JitCompiledFnData, PureFunctionData} from '@mionkit/core/src/types';
import {RpcError} from '@mionkit/core/src/errors';
import {GET_REMOTE_METHODS_BY_ID, GET_REMOTE_METHODS_BY_PATH} from '@mionkit/core/src/constants';
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
import {route} from './handlers';
import {PublicProcedure} from './types/publicProcedures';
import {RouterOptions, Routes} from './types/general';
import {getSerializableProcedure, serializeProcedureDeps} from './remoteMethodsMetadata';
import {NonRawProcedure, Procedure} from './types/procedures';

export type PublicProcedures = Record<string, PublicProcedure>;
export interface ClientRouteOptions extends RouterOptions {
    getAllRemoteMethodsMaxNumber?: number;
}

export interface ProceduresData {
    procedures: PublicProcedures;
    deps: Record<string, JitCompiledFnData>;
    purFnDeps: Record<string, PureFunctionData>;
}

export const defaultClientRouteOptions = {
    getAllRemoteMethodsMaxNumber: 100,
};

function addRequiredRemoteMethodsToResponse(id: string, resp: ProceduresData, errorData: AnyObject): void {
    const {procedures, deps, purFnDeps} = resp;
    if (procedures[id]) return;
    const executable = getHookExecutable(id) || getRouteExecutable(id);
    if (!executable) {
        errorData[id] = `Remote Method ${id} not found`;
        return;
    }
    if (isPrivateExecutable(executable)) return;

    const procedure = getSerializableProcedure(executable as NonRawProcedure);
    procedures[id] = procedure;
    procedure.hookIds?.forEach((hookId) => addRequiredRemoteMethodsToResponse(hookId, resp, errorData));
    serializeProcedureDeps(procedure, deps, purFnDeps);
}

const getRemoteMethods = (ctx, methodsIds: string[], getAllRemoteMethods?: boolean): ProceduresData | RpcError => {
    const resp: ProceduresData = {
        procedures: {},
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

const getRouteRemoteMethods = (ctx, path: string, getAllRemoteMethods?: boolean): ProceduresData | RpcError => {
    const executables = getRouteExecutionPath(path);
    if (!executables)
        return new RpcError({
            statusCode: 404,
            name: 'Invalid Metadata Request',
            publicMessage: `Route ${path} not found`,
        });
    const privateExecutables = executables.procedures.filter((e) => !isPrivateExecutable(e));
    return getRemoteMethods(
        ctx,
        privateExecutables.map((e) => e.id),
        getAllRemoteMethods
    );
};

// disable serialization as deserializer seems to ignore serializedTypes
const routerOpts = {deserializeParams: false};
export const clientRoutes = {
    [GET_REMOTE_METHODS_BY_ID]: route(getRemoteMethods, routerOpts),
    [GET_REMOTE_METHODS_BY_PATH]: route(getRouteRemoteMethods, routerOpts),
} satisfies Routes;
