/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {
    getHookExecutable,
    getHookFieldName,
    getRouteDefaultParams,
    getRouteExecutable,
    getRouteExecutionPath,
    getRoutePath,
} from './router';
import {
    Handler,
    isHookDef,
    isRoute,
    Obj,
    PublicMethods,
    PublicHandler,
    PublicHook,
    PublicRoute,
    Routes,
    isPublicExecutable,
    RouteExecutable,
    HookExecutable,
    isRawHookDef,
} from './types';
import {getSerializedFunctionTypes} from '@mionkit/runtype';

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
    entries.forEach(([key, item]) => {
        const newPointer = [...currentPointer, key];
        const newPointerAsString = newPointer.join('.');
        if (isRawHookDef(item)) {
            publicData[key] = null;
        } else if (isHookDef(item)) {
            const fieldName = getHookFieldName(item, key);
            const executable = getHookExecutable(fieldName);
            if (!executable)
                throw new Error(`Hook '${fieldName}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicHookFromExecutable(executable, newPointerAsString);
        } else if (isRoute(item)) {
            const path = getRoutePath(item, join(...newPointer));
            const executable = getRouteExecutable(path);
            if (!executable)
                throw new Error(`Route '${path}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicRouteFromExecutable(executable, newPointerAsString);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetPublicRoutes(subRoutes, newPointer);
        }
    });

    return publicData;
}

function getPublicRouteFromExecutable<H extends Handler>(executable: RouteExecutable, propertyPonter: string): PublicRoute<H> {
    return {
        isRoute: true,
        canReturnData: true,
        path: executable.path,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: propertyPonter as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionTypes(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
        publicExecutionPathPointers:
            getRouteExecutionPath(executable.path)
                ?.filter((exec) => isPublicExecutable(exec))
                .map((exec) => exec.selfPointer) || [],
    };
}

function getPublicHookFromExecutable<H extends Handler>(executable: HookExecutable, propertyPonter: string): PublicHook<H> {
    return {
        isRoute: false,
        canReturnData: executable.canReturnData,
        inHeader: executable.inHeader,
        fieldName: executable.fieldName,
        // handler is included just for static typing purposes and shouldn't be called directly
        _handler: propertyPonter as any as PublicHandler<H>,
        handlerSerializedType: getSerializedFunctionTypes(executable.handler),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
    };
}
