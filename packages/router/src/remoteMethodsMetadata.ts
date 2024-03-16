/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Handler} from './types/handlers';
import {type RouterEntry, type Routes} from './types/general';
import {type Procedure} from './types/procedures';
import {ProcedureType} from './types/procedures';
import type {PublicApi, PublicHandler, PublicProcedure} from './types/publicProcedures';
import {isRoute, isHeaderHookDef, isHookDef, isPublicExecutable} from './types/guards';
import {
    getHookExecutable,
    getRouteExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    isPrivateProcedure,
    shouldFullGenerateSpec,
} from './router';
import {getSerializableJitCompiler} from '@mionkit/runtype';
import {AnyObject, getRoutePath, getRouterItemId} from '@mionkit/core';

// ############# PRIVATE STATE #############
const metadataById: Map<string, PublicProcedure> = new Map();

// ############# PUBLIC METHODS #############
export function resetRemoteMethodsMetadata() {
    metadataById.clear();
}

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getRemoteMethodsMetadata<R extends Routes>(routes: R): PublicApi<R> {
    return recursiveGetMethodsMetadata(routes) as PublicApi<R>;
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

        if (isPrivateProcedure(item, id)) {
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

export function getMethodMetadataFromExecutable<H extends Handler>(executable: Procedure): PublicProcedure<H> {
    const existing = metadataById.get(executable.id);
    if (existing) return existing as PublicProcedure<H>;

    if (!executable.handlerRunType) throw new Error(`Handler run type not found for ${executable.id}`);

    const newRemoteMethod: PublicProcedure = {
        type: executable.type,
        id: executable.id,
        // handler is included just for static typing purposes and should never be called directly
        handler: getHandlerSrcCodePointer(executable) as any as PublicHandler<H>,
        serializedFnParams: getSerializableJitCompiler(executable.handlerRunType?.compiledParams),
        serializedFnReturn: getSerializableJitCompiler(executable.handlerRunType?.compiledReturn),
        useValidation: !!executable.options.useValidation,
        useSerialization: !!executable.options.useSerialization,
        params: executable.handlerRunType.parameterTypes.map((p) => p.paramName),
    };

    // initialized separately so the property `headerName` is not included in the object in case is undefined
    if (executable.headerName) newRemoteMethod.headerName = executable.headerName;

    if (executable.type === ProcedureType.route) {
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
    return newRemoteMethod as PublicProcedure<H>;
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= users/getUser => 'users.getUser'  */
function getHandlerSrcCodePointer(executable: Procedure) {
    return executable.pointer.join('.');
}
