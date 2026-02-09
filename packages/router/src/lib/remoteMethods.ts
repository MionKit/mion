/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type RouterEntry, type Routes} from '../types/general';
import {type RemoteMethod} from '../types/remoteMethods';
import type {PublicApi} from '../types/publicMethods';
import type {
    AnyObject,
    JitCompiledFn,
    JitCompiledFnData,
    PureFunctionData,
    MethodWithOptions,
    PureFnsDataCache,
} from '@mionkit/core';
import {isRoute, isHeadersLinkedFnDef, isLinkedFnDef, isPublicExecutable} from '../types/guards';
import {
    getLinkedFnExecutable,
    getRouteExecutable,
    getRouteExecutionChain,
    getRouterOptions,
    isPrivateDefinition,
} from '../router';
import {
    getRoutePath,
    getRouterItemId,
    MAX_STACK_DEPTH,
    getJitFnHashes,
    getJitUtils,
    HandlerType,
    EMPTY_HASH,
    MION_ROUTES,
} from '@mionkit/core';

/** Internal mion route IDs that should not be exposed to clients */
const mionInternalRoutes = Object.values(MION_ROUTES) as string[];

// ############# PRIVATE STATE #############
const publicMethods: Map<string, MethodWithOptions> = new Map();

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
            publicData[key] = null; // linkedFns that don't receive or return data are not public
        } else if (isLinkedFnDef(item) || isHeadersLinkedFnDef(item) || isRoute(item)) {
            const executable = getLinkedFnExecutable(id) || getRouteExecutable(id);
            if (!executable)
                throw new Error(`Route or LinkedFn ${id} not found. Please check you have called router.registerRoutes first.`);
            publicData[key] = getSerializableMethod(executable as RemoteMethod);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetSerializableRoutes(subRoutes, itemPointer);
        }
    });

    return publicData;
}

export function getSerializableMethod(executable: RemoteMethod): MethodWithOptions {
    const existing = publicMethods.get(executable.id);
    if (existing) return existing as MethodWithOptions;

    const newRemoteMethod: MethodWithOptions = {
        type: executable.type,
        id: executable.id,
        nestLevel: executable.nestLevel,
        isAsync: executable.isAsync,
        hasReturnData: executable.hasReturnData,
        paramsJitHash: executable.paramsJitHash,
        returnJitHash: executable.returnJitHash,
        pointer: executable.pointer,
        ...(executable.paramNames ? {paramNames: executable.paramNames} : {}),
        options: executable.options,
    };
    if (executable.headersParam) newRemoteMethod.headersParam = executable.headersParam;
    if (executable.type === HandlerType.route) {
        const path = getRoutePath(executable.pointer, getRouterOptions());
        const pathPointers =
            getRouteExecutionChain(path)
                ?.methods.filter((exec) => isPublicExecutable(exec))
                .map((exec) => exec.pointer) || [];
        newRemoteMethod.linkedFnIds = pathPointers
            .map((pointer) => getRouterItemId(pointer))
            .filter((id) => {
                if (mionInternalRoutes.includes(id)) return false;
                const exec = getLinkedFnExecutable(id);
                return exec && isPublicExecutable(exec);
            });
    }
    publicMethods.set(executable.id, newRemoteMethod);
    return newRemoteMethod as MethodWithOptions;
}

/** Serializes pure function dependencies into a namespaced cache structure.
 * @param namespacedDepHash - Pure function dependency in format "namespace::fnHash"
 * @param purFnDeps - Namespaced cache to store serialized pure functions
 * @param depth - Current recursion depth for stack overflow protection
 */
export function serializePureDeps(namespacedDepHash: string, purFnDeps: PureFnsDataCache, depth = 0) {
    if (depth >= MAX_STACK_DEPTH)
        throw new Error(`Max depth reached serializing pure function dependencies, for: ${namespacedDepHash}`);
    // Parse "namespace::fnHash" format
    const parts = namespacedDepHash.split('::');
    if (parts.length !== 2)
        throw new Error(`Invalid pure function dependency format: ${namespacedDepHash}, expected "namespace::fnHash"`);
    const [namespace, fnHash] = parts;
    // Ensure namespace exists in the cache
    if (!purFnDeps[namespace]) purFnDeps[namespace] = {};
    // Check if already serialized (prevent infinite recursion on circular dependencies)
    if (purFnDeps[namespace][fnHash]) return;
    const pureDep = getJitUtils().getCompiledPureFn(namespace, fnHash);
    if (!pureDep) throw new Error(`Pure function ${fnHash} not found in namespace ${namespace}`);
    const serializedPureDep: PureFunctionData = {
        namespace: pureDep.namespace,
        paramNames: pureDep.paramNames,
        code: pureDep.code,
        pureFnHash: pureDep.pureFnHash,
        dependencies: new Set(pureDep.dependencies),
    };
    purFnDeps[namespace][fnHash] = serializedPureDep;
    // Dependencies within the same namespace are stored as just fnHash, not namespaced
    pureDep.dependencies.forEach((depFnHash) => serializePureDeps(`${namespace}::${depFnHash}`, purFnDeps, depth + 1));
}

export function serializeJitFn(
    jitFnHash: string,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: PureFnsDataCache,
    depth = 0
) {
    if (depth >= MAX_STACK_DEPTH)
        throw new Error(`Max depth reached serializing jit function dependencies for jitHash: ${jitFnHash}`);
    const jitFn = getJitUtils().getJIT(jitFnHash);
    if (!jitFn) throw new Error(`Jit function ${jitFnHash} not found`);
    if (deps[jitFnHash]) return; // already serialized and prevent infinite recursion on circular dependencies
    const serializedJitFn = getSerializableJitCompiler(jitFn);
    deps[jitFnHash] = serializedJitFn;
    jitFn.dependenciesSet.forEach((h) => serializeJitFn(h, deps, purFnDeps, depth + 1));
    jitFn.pureFnDependencies.forEach((h) => serializePureDeps(h, purFnDeps));
}

export function serializeMethodDeps(
    method: MethodWithOptions,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: PureFnsDataCache
) {
    const {paramsJitHash, returnJitHash} = method;
    // Skip serialization for empty hashes (no params or void return)
    if (paramsJitHash !== EMPTY_HASH) {
        const paramsJitHashes = getJitFnHashes(paramsJitHash);
        for (const k in paramsJitHashes) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    }
    if (returnJitHash !== EMPTY_HASH) {
        const returnJitHashes = getJitFnHashes(returnJitHash);
        for (const k in returnJitHashes) serializeJitFn(returnJitHashes[k], deps, purFnDeps);
    }
}

function getSerializableJitCompiler(comp: JitCompiledFn): JitCompiledFnData {
    return {
        typeName: comp.typeName,
        fnID: comp.fnID,
        jitFnHash: comp.jitFnHash,
        args: structuredClone(comp.args),
        isNoop: comp.isNoop,
        defaultParamValues: structuredClone(comp.defaultParamValues),
        code: comp.code,
        dependenciesSet: new Set(comp.dependenciesSet),
        pureFnDependencies: new Set(comp.pureFnDependencies),
        ...(comp.paramNames ? {paramNames: [...comp.paramNames]} : {}),
    };
}
