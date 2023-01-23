/* ########
 * 2023 MikroKit
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {join} from 'path';
import {getHookExecutable, getHookFieldName, getRouteExecutable, getRoutePath} from './router';
import {Executable, Handler, isHookDef, isRoute, Obj, ApiSpec, PublicHandler, PublicHook, PublicRoute, Routes} from './types';

export const getPublicData = <R extends Routes>(routes: R): ApiSpec<R> => {
    return recursiveGetPublicData(routes) as ApiSpec<R>;
};

const recursiveGetPublicData = <R extends Routes>(routes: R, currentPointer: string[] = [], publicData: Obj = {}): Obj => {
    const entries = Object.entries(routes);
    entries.forEach(([key, item], index, array) => {
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
            publicData[key] = recursiveGetPublicData(subRoutes, newPointer);
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
        handler: (() => null) as any as PublicHandler<H>,
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        selfPointer: executable.selfPointer,
    };
    return publicEntry.isRoute ? (publicEntry as PublicRoute<H>) : (publicEntry as PublicHook<H>);
};
