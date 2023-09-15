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
    shouldFullGenerateSpec,
} from './router';
import {
    Handler,
    isHookDef,
    isRoute,
    RemoteApi,
    RemoteHandler,
    Routes,
    isPublicExecutable,
    RouteExecutable,
    HookExecutable,
    isHeaderHookDef,
    RouterEntry,
    Executable,
    RemoteMethodMetadata,
} from './types';
import {getSerializedFunctionType} from '@mionkit/reflection';
import {AnyObject, getRoutePath, getRouterItemId} from '@mionkit/core';

// ############# PRIVATE STATE #############
const metadataById: Map<string, RemoteMethodMetadata> = new Map();

// ############# PUBLIC METHODS #############
export function resetRemoteMethodsMetadata() {
    metadataById.clear();
}

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getRemoteMethodsMetadata<R extends Routes>(routes: R): RemoteApi<R> {
    return recursiveGetMethodsMetadata(routes) as RemoteApi<R>;
}

// ############# PRIVATE METHODS #############

function recursiveGetMethodsMetadata<R extends Routes>(
    routes: R,
    currentPointer: string[] = [],
    publicData: AnyObject = {}
): AnyObject {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]: [string, RouterEntry]) => {
        const itemPointer = [...currentPointer, key];
        const id = getRouterItemId(itemPointer);

        if (isPrivateHookDef(item, id)) {
            publicData[key] = null; // hooks that don't receive or return data are not public
        } else if (isHookDef(item) || isHeaderHookDef(item) || isRoute(item)) {
            const executable = getHookExecutable(id) || getRouteExecutable(id);
            if (!executable)
                throw new Error(`Route or Hook ${id} not found. Please check you have called router.registerRoutes first.`);
            publicData[key] = getMethodMetadataFromExecutable(executable);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetMethodsMetadata(subRoutes, itemPointer);
        }
    });

    return publicData;
}

export function getMethodMetadataFromExecutable<H extends Handler>(
    executable: RouteExecutable | HookExecutable
): RemoteMethodMetadata<H> {
    const existing = metadataById.get(executable.id);
    if (existing) return existing as RemoteMethodMetadata<H>;

    const newRemoteMethod: RemoteMethodMetadata = {
        isRoute: executable.isRoute,
        id: executable.id,
        inHeader: executable.inHeader,
        // handler is included just for static typing purposes and should never be called directly
        _handler: getHandlerSrcCodePointer(executable) as any as RemoteHandler<H>,
        serializedTypes: getSerializedFunctionType(executable.handler, getRouteDefaultParams().length),
        enableValidation: executable.enableValidation,
        enableSerialization: executable.enableSerialization,
        params: executable.reflection.handlerType.parameters.map((tp) => tp.name).slice(getRouteDefaultParams().length),
    };

    if (executable.headerName) newRemoteMethod.headerName = executable.headerName;

    if (executable.isRoute) {
        const path = getRoutePath(executable.pointer, getRouterOptions());
        const pathPointers =
            getRouteExecutionPath(path)
                ?.filter((exec) => isPublicExecutable(exec))
                .map((exec) => exec.pointer) || [];
        newRemoteMethod.hookIds = pathPointers
            .map((pointer) => getRouterItemId(pointer))
            .filter((id) => {
                const exec = getHookExecutable(id);
                return exec && isPublicExecutable(exec);
            });
        // pathPointers only required for codegen
        if (shouldFullGenerateSpec()) newRemoteMethod.pathPointers = pathPointers;
    }
    metadataById.set(executable.id, newRemoteMethod);
    return newRemoteMethod as RemoteMethodMetadata<H>;
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= users/getUser => 'users.getUser'  */
function getHandlerSrcCodePointer(executable: Executable) {
    return executable.pointer.join('.');
}
