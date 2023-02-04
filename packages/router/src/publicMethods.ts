/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {ROUTE_DEFAULT_PARAM} from './constants';
import {getHookExecutable, getHookFieldName, getRouteExecutable, getRoutePath} from './router';
import {
    Executable,
    Handler,
    isHookDef,
    isRoute,
    Obj,
    PublicMethods,
    PublicHandler,
    PublicHook,
    PublicMethod,
    Routes,
} from './types';

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export const getPublicRoutes = <R extends Routes>(routes: R): PublicMethods<R> => {
    return recursiveGetPublicRoutes(routes) as PublicMethods<R>;
};

const recursiveGetPublicRoutes = <R extends Routes>(routes: R, currentPointer: string[] = [], publicData: Obj = {}): Obj => {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]) => {
        const newPointer = [...currentPointer, key];
        const newPointerAsString = newPointer.join('.');
        if (isHookDef(item)) {
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
            publicData[key] = getPublicMethodFromExecutable(executable, newPointerAsString);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetPublicRoutes(subRoutes, newPointer);
        }
    });

    return publicData;
};

const getPublicMethodFromExecutable = <H extends Handler>(executable: Executable, propertyPonter: string): PublicMethod<H> => {
    return {
        isRoute: true,
        canReturnData: true,
        path: executable.path,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and shouldn't be called directly
        handlerType: propertyPonter as any as PublicHandler<H>,
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.handlerType.parameters.map((tp) => tp.name).slice(ROUTE_DEFAULT_PARAM.length),
    };
};

const getPublicHookFromExecutable = <H extends Handler>(executable: Executable, propertyPonter: string): PublicHook<H> => {
    return {
        isRoute: false,
        canReturnData: executable.canReturnData,
        inHeader: executable.inHeader,
        fieldName: executable.fieldName,
        // handler is included just for static typing purposes and shouldn't be called directly
        handlerType: propertyPonter as any as PublicHandler<H>,
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.handlerType.parameters.map((tp) => tp.name).slice(ROUTE_DEFAULT_PARAM.length),
    };
};
