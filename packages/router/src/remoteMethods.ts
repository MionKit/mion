/* ########
 * 2023 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {type RouterEntry, type Routes} from './types/general';
import {type Method} from './types/remoteMethods';
import {HandlerType} from './types/remoteMethods';
import type {PublicApi} from './types/publicMethods';
import {isRoute, isHeaderHookDef, isHookDef, isPublicExecutable} from './types/guards';
import {
    getHookExecutable,
    getRouteExecutable,
    getRouteExecutionPath,
    getRouterOptions,
    isPrivateDefinition,
    shouldFullGenerateSpec,
} from './router';
import type {
    AnyObject,
    JitCompiledFn,
    JitCompiledFnData,
    JitCompiledFunctions,
    PureFunctionData,
    SerializableJitHashes,
    SerializablePublicMethod,
} from '@mionkit/core';
import {getRoutePath, getRouterItemId} from '@mionkit/core';
import {jitUtils} from '@mionkit/core';
import {MAX_STACK_DEPTH} from '@mionkit/core';

// ############# PRIVATE STATE #############
const publicMethods: Map<string, SerializablePublicMethod> = new Map();

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
            publicData[key] = getSerializableMethod(executable as Method);
        } else {
            const subRoutes: Routes = routes[key] as Routes;
            publicData[key] = recursiveGetSerializableRoutes(subRoutes, itemPointer);
        }
    });

    return publicData;
}

export function getSerializableMethod(executable: Method): SerializablePublicMethod {
    const existing = publicMethods.get(executable.id);
    if (existing) return existing as SerializablePublicMethod;

    const newRemoteMethod: SerializablePublicMethod = {
        type: executable.type,
        id: executable.id,
        paramsJitHashes: getSerializableJitHashes(executable.paramsJitFns),
        returnJitHashes: getSerializableJitHashes(executable.returnJitFns),
        paramNames: executable.paramNames,
    };
    if (executable.headersParam) newRemoteMethod.headersParam = executable.headersParam;
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
    return newRemoteMethod as SerializablePublicMethod;
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
    method: SerializablePublicMethod,
    deps: Record<string, JitCompiledFnData>,
    purFnDeps: Record<string, PureFunctionData>
) {
    const {paramsJitHashes, returnJitHashes} = method;
    for (const k in paramsJitHashes) serializeJitFn(paramsJitHashes[k], deps, purFnDeps);
    for (const k in returnJitHashes) serializeJitFn(returnJitHashes[k], deps, purFnDeps);
}

function getSerializableJitHashes(jitFns: JitCompiledFunctions): SerializableJitHashes {
    return {
        isType: jitFns.isType.jitFnHash,
        typeErrors: jitFns.typeErrors.jitFnHash,
        prepareForJson: jitFns.prepareForJson.jitFnHash,
        restoreFromJson: jitFns.restoreFromJson.jitFnHash,
        jsonStringify: jitFns.jsonStringify.jitFnHash,
        toBinary: jitFns.toBinary.jitFnHash,
        fromBinary: jitFns.fromBinary.jitFnHash,
    };
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
        ...(comp.paramNames ? {paramNames: structuredClone(comp.paramNames)} : {}),
    };
}
