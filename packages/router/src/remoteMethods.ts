/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    getHookExecutable,
    getRouteDefaultParams,
    getRouteExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    isPrivateHookDef,
} from './router';
import {
    Handler,
    isHookDef,
    isRoute,
    RemoteMethods,
    RemoteHandler,
    Routes,
    isPublicExecutable,
    RouteExecutable,
    HookExecutable,
    isHeaderHookDef,
    RouterEntry,
    Executable,
    RemoteMethod,
} from './types';
import {getSerializedFunctionType} from '@mionkit/runtype';
import {Obj, getRoutePath, getRouterItemId} from '@mionkit/core';

// ############# PRIVATE STATE #############
const remoteMethodsById: Map<string, RemoteMethod> = new Map();

// ############# PUBLIC METHODS #############
export function resetRemoteMethods() {
    remoteMethodsById.clear();
}

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getRemoteMethods<R extends Routes>(routes: R): RemoteMethods<R> {
    return recursiveGetRemoteMethods(routes) as RemoteMethods<R>;
}

// ############# PRIVATE METHODS #############

function recursiveGetRemoteMethods<R extends Routes>(routes: R, currentPointer: string[] = [], publicData: Obj = {}): Obj {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]: [string, RouterEntry]) => {
        const itemPointer = [...currentPointer, key];

        if (isPrivateHookDef(item)) {
            publicData[key] = null; // hooks that don't receive or return data are not public
        } else if (isHookDef(item) || isHeaderHookDef(item) || isRoute(item)) {
            const id = getRouterItemId(itemPointer);
            const executable = getHookExecutable(id) || getRouteExecutable(id);
            if (!executable)
                throw new Error(`Route or Hook ${id} not found. Please check you have called router.registerRoutes first.`);
            publicData[key] = getRemoteMethodFromExecutable(executable);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetRemoteMethods(subRoutes, itemPointer);
        }
    });

    return publicData;
}

export function getRemoteMethodFromExecutable<H extends Handler>(executable: RouteExecutable | HookExecutable): RemoteMethod<H> {
    const existing = remoteMethodsById.get(executable.id);
    if (existing) return existing as RemoteMethod<H>;
    let executionPathPointers;
    if (executable.isRoute) {
        const path = getRoutePath(executable.pointer, getRouterOptions());
        executionPathPointers = getRouteExecutionPath(path)
            ?.filter((exec) => isPublicExecutable(exec))
            .map((exec) => exec.pointer);
    }
    const newRemoteMethod = {
        isRoute: executable.isRoute,
        id: executable.id,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and should never be called directly
        _handler: getHandlerSrcCodePointer(executable) as any as RemoteHandler<H>,
        handlerSerializedType: getSerializedFunctionType(executable.handler, getRouteDefaultParams().length),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
        executionPathPointers,
        headerName: executable.headerName,
    };
    remoteMethodsById.set(executable.id, newRemoteMethod);
    return newRemoteMethod as RemoteMethod<H>;
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= users/getUser => 'users.getUser'  */
function getHandlerSrcCodePointer(executable: Executable) {
    return executable.pointer.join('.');
}
