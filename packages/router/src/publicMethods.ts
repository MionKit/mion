/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {
    getHookExecutable,
    getRouteDefaultParams,
    getRouteExecutable,
    getRouteExecutionPath,
    getRoutePath,
    getSrcPointer,
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
} from './types';
import {getSerializedFunctionType} from '@mionkit/runtype';
import {Obj} from '@mionkit/core';

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
        const newPointer = [...currentPointer, key];

        const isHeaderHook = isHeaderHookDef(item);
        if (isPrivateHookDef(item)) {
            publicData[key] = null;
        } else if (isHookDef(item) || isHeaderHook) {
            const path = isHeaderHook ? item.headerName : getRoutePath(join(...newPointer));
            const executable = getHookExecutable(path);
            if (!executable)
                throw new Error(`Hook '${path}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicHookFromExecutable(executable);
        } else if (isRoute(item)) {
            const path = getRoutePath(join(...newPointer));
            const executable = getRouteExecutable(path);
            if (!executable)
                throw new Error(`Route '${path}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicRouteFromExecutable(executable);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetPublicRoutes(subRoutes, newPointer);
        }
    });

    return publicData;
}

function getPublicRouteFromExecutable<H extends Handler>(executable: RouteExecutable): PublicRoute<H> {
    return {
        isRoute: true,
        path: executable.path,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: getHandlerPointer(executable.path) as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionType(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
        executionPathNames:
            getRouteExecutionPath(executable.path)
                ?.filter((exec) => isPublicExecutable(exec))
                .map((exec) => exec.path) || [],
    };
}

function getPublicHookFromExecutable<H extends Handler>(executable: HookExecutable): PublicHook<H> {
    return {
        isRoute: false,
        inHeader: executable.inHeader,
        path: executable.path,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: getHandlerPointer(executable.path) as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionType(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
    };
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= /api/v1/users/getUser => 'users.getUser'  */
function getHandlerPointer(path: string) {
    return getSrcPointer(path).join('.');
}
