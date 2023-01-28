/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {getHookExecutable, getHookFieldName, getRouteExecutable, getRoutePath} from './router';
import {
    Executable,
    Handler,
    isHookDef,
    isRoute,
    Obj,
    PublicRoutes,
    PublicHandler,
    PublicHook,
    PublicRoute,
    Routes,
} from './types';

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export const getPublicRoutes = <R extends Routes>(routes: R): PublicRoutes<R> => {
    return recursiveGetPublicRoutes(routes) as PublicRoutes<R>;
};

const recursiveGetPublicRoutes = <R extends Routes>(routes: R, currentPointer: string[] = [], publicData: Obj = {}): Obj => {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]) => {
        const newPointer = [...currentPointer, key];
        if (isHookDef(item)) {
            const fieldName = getHookFieldName(item, key);
            const executable = getHookExecutable(fieldName);
            if (!executable)
                throw new Error(`Hook '${fieldName}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicDataFromExecutable(executable);
        } else if (isRoute(item)) {
            const path = getRoutePath(item, join(...newPointer));
            const executable = getRouteExecutable(path);
            if (!executable)
                throw new Error(`Route '${path}' not found in router. Please check you have called router.addRoutes first!`);
            publicData[key] = getPublicDataFromExecutable(executable);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetPublicRoutes(subRoutes, newPointer);
        }
    });

    return publicData;
};

const getPublicDataFromExecutable = <H extends Handler>(executable: Executable): PublicRoute<H> | PublicHook<H> => {
    const publicEntry = {
        isRoute: executable.isRoute,
        canReturnData: executable.canReturnData,
        path: executable.path,
        inHeader: executable.inHeader,
        fieldName: executable.fieldName,
        handler: (() => {
            throw new Error(`Public Route handler can't be called directly, included for type information only.`);
        }) as any as PublicHandler<H>,
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        selfPointer: executable.selfPointer,
    };
    return publicEntry.isRoute ? (publicEntry as PublicRoute<H>) : (publicEntry as PublicHook<H>);
};
