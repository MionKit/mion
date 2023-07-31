/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    getHookExecutable,
    getPathFromPointer,
    getRouteDefaultParams,
    getRouteExecutable,
    getRouteExecutionPath,
    isPrivateHookDef,
} from './router';
import {
    Handler,
    isHookDef,
    isRoute,
    PublicMethods,
    PublicHandler,
    PublicHook,
    PublicRoute,
    Routes,
    isPublicExecutable,
    RouteExecutable,
    HookExecutable,
    isHeaderHookDef,
    RouterEntry,
    Executable,
} from './types';
import {getSerializedFunctionType} from '@mionkit/runtype';
import {Obj, getRouterItemId} from '@mionkit/core';

// ############# PUBLIC METHODS #############

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getPublicRoutes<R extends Routes>(routes: R): PublicMethods<R> {
    return recursiveGetPublicRoutes(routes) as PublicMethods<R>;
}

// ############# PRIVATE METHODS #############

function recursiveGetPublicRoutes<R extends Routes>(routes: R, currentPointer: string[] = [], publicData: Obj = {}): Obj {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]: [string, RouterEntry]) => {
        const itemPointer = [...currentPointer, key];

        const isHeaderHook = isHeaderHookDef(item);
        if (isPrivateHookDef(item)) {
            publicData[key] = null;
        } else if (isHookDef(item) || isHeaderHook) {
            const id = isHeaderHook ? item.headerName : getRouterItemId(itemPointer);
            const executable = getHookExecutable(id);
            if (!executable)
                throw new Error(`Hook '${id}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicHookFromExecutable(executable);
        } else if (isRoute(item)) {
            const id = getRouterItemId(itemPointer);
            const executable = getRouteExecutable(id);
            if (!executable)
                throw new Error(`Route '${id}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicRouteFromExecutable(executable);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetPublicRoutes(subRoutes, itemPointer);
        }
    });

    return publicData;
}

function getPublicRouteFromExecutable<H extends Handler>(executable: RouteExecutable): PublicRoute<H> {
    const path = getPathFromPointer(executable.pointer);
    const executionPathPointers = getRouteExecutionPath(path)
        ?.filter((exec) => isPublicExecutable(exec))
        .map((exec) => exec.pointer);
    return {
        isRoute: true,
        id: executable.id,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: getHandlerSrcCodePointer(executable) as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionType(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
        executionPathPointers,
    };
}

function getPublicHookFromExecutable<H extends Handler>(executable: HookExecutable): PublicHook<H> {
    return {
        isRoute: false,
        inHeader: executable.inHeader,
        id: executable.id,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: getHandlerSrcCodePointer(executable) as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionType(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
    };
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= users/getUser => 'users.getUser'  */
function getHandlerSrcCodePointer(executable: Executable) {
    return executable.pointer.join('.');
}
