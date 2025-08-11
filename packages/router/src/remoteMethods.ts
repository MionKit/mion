/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import type {Handler} from './types/handlers';
import {type RouterEntry, type Routes} from './types/general';
import {NonRawMethod, type Method} from './types/remoteMethods';
import {HandlerType} from './types/remoteMethods';
import type {PublicApi, PublicHandler, PublicMethod, SerializableJitHashes} from './types/publicMethods';
import {isRoute, isHeaderHookDef, isHookDef, isPublicExecutable} from './types/guards';
import {
    getHookExecutable,
    getRouteExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    isPrivateDefinition,
    shouldFullGenerateSpec,
} from './router';
import type {AnyObject, JitCompiledFnData, JitCompiledFunctions, PureFunctionData} from '@mionkit/core';
import {getRoutePath, getRouterItemId} from '@mionkit/core';
import {jitUtils} from '@mionkit/core';
import {getSerializableJitCompiler} from '@mionkit/run-types';
import {MAX_STACK_DEPTH} from '@mionkit/core';

// ############# PRIVATE STATE #############
const publicMethods: Map<string, PublicMethod> = new Map();

// ############# PUBLIC METHODS #############
export function resetRemoteMethodsMetadata() {
    publicMethods.clear();
}

/**
 * Returns a data structure containing all public information and types of the routes.
 * This data and types can be used to generate router clients, etc...
 */
export function getPublicApi<R extends Routes>(routes: R): PublicApi<R> {
    return recursiveGetSerializableRoutes(routes) as PublicApi<R>;
}

// ############# PRIVATE METHODS #############

function recursiveGetSerializableRoutes<R extends Routes>(
    routes: R,
    currentPointer: string[] = [],
    publicData: AnyObject = {}
): AnyObject {
    const entries = Object.entries(routes);
    entries.forEach(([key, item]: [string, RouterEntry]) => {
        const itemPointer = [...currentPointer, key];
        const id = getRouterItemId(itemPointer);

        if (isPrivateDefinition(item, id)) {
            publicData[key] = null; // hooks that don't receive or return data are not public
        } else if (isHookDef(item) || isHeaderHookDef(item) || isRoute(item)) {
            const executable = getHookExecutable(id) || getRouteExecutable(id);
            if (!executable)
                throw new Error(`Route or Hook ${id} not found. Please check you have called router.registerRoutes first.`);
            publicData[key] = getSerializableMethod(executable as NonRawMethod);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetSerializableRoutes(subRoutes, itemPointer);
        }
    });

    return publicData;
}

export function getSerializableMethod<H extends Handler>(executable: NonRawMethod): PublicMethod<H> {
    const existing = publicMethods.get(executable.id);
    if (existing) return existing as PublicMethod<H>;

    const newRemoteMethod: PublicMethod = {
        type: executable.type,
        id: executable.id,
        // handler is included just for static typing purposes and should never be called directly.
        // It's value during run type is a string with the pointer to the handler
        handler: getHandlerSrcCodePointer(executable) as any as PublicHandler<H>,
        paramsJitHashes: getSerializableJitHashes(executable.paramsJitFns),
        returnJitHashes: getSerializableJitHashes(executable.returnJitFns),
        paramNames: executable.paramNames,
    };

    // initialized separately so the property `headerName` is not included in the object in case is undefined
    if (executable.headerNames) newRemoteMethod.headerNames = executable.headerNames;

    if (executable.type === HandlerType.route) {
        const path = getRoutePath(executable.pointer, getRouterOptions());
        const pathPointers =
            getRouteExecutionPath(path)
                ?.methods.filter((exec) => isPublicExecutable(exec))
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
    publicMethods.set(executable.id, newRemoteMethod);
    return newRemoteMethod as PublicMethod<H>;
}

export function serializePureDeps(depHash: string, purFnDeps: Record<string, PureFunctionData>, depth = 0) {
    if (depth >= 0) throw new Error(`Max depth reached serializing pure function dependencies, for: ${depHash}`);
    const pureDep = jitUtils.getCompiledPureFn(depHash);
    if (!pureDep) throw new Error(`Pure function ${depHash} not found`);
    if (purFnDeps[pureDep.pureFnHash]) return; // already serialized and prevent infinite recursion on circular dependencies
    const serializedPureDep: PureFunctionData = {
        paramNames: pureDep.paramNames,
        code: pureDep.code,
        pureFnHash: pureDep.pureFnHash,
        dependencies: new Set(pureDep.dependencies),
    };
    purFnDeps[pureDep.pureFnHash] = serializedPureDep;
    pureDep.dependencies.forEach((h) => serializePureDeps(h, purFnDeps));
}

export function serializeJitFn(
    jitFnHash: string,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: Record<string, PureFunctionData>,
    depth = 0
) {
    if (depth >= MAX_STACK_DEPTH)
        throw new Error(`Max depth reached serializing jit function dependencies for jitHash: ${jitFnHash}`);
    const jitFn = jitUtils.getJIT(jitFnHash);
    if (!jitFn) throw new Error(`Jit function ${jitFnHash} not found`);
    if (deps[jitFnHash]) return; // already serialized and prevent infinite recursion on circular dependencies
    const serializedJitFn = getSerializableJitCompiler(jitFn);
    deps[jitFnHash] = serializedJitFn;
    jitFn.dependenciesSet.forEach((h) => serializeJitFn(h, deps, purFnDeps, ++depth));
    jitFn.pureFnDependencies.forEach((h) => serializePureDeps(h, purFnDeps));
}

export function serializeMethodDeps(
    method: PublicMethod,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: Record<string, PureFunctionData>
) {
    const {paramsJitHashes, returnJitHashes} = method;
    for (const k in paramsJitHashes) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    for (const k in returnJitHashes) serializeJitFn(returnJitHashes[k], deps, purFnDeps);
}

/** Returns the original route/hook paths as a string to eb used in codegen, ie: path= users/getUser => 'users.getUser'  */
function getHandlerSrcCodePointer(executable: Method) {
    return executable.pointer.join('.');
}

function getSerializableJitHashes(jitFns: JitCompiledFunctions): SerializableJitHashes {
    return {
        isType: jitFns.isType.jitFnHash,
        typeErrors: jitFns.typeErrors.jitFnHash,
        toJsonVal: jitFns.toJsonVal.jitFnHash,
        fromJsonVal: jitFns.fromJsonVal.jitFnHash,
        jsonStringify: jitFns.jsonStringify.jitFnHash,
    };
}
