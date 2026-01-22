/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    MethodsCache,
    MethodMetadata,
    getENV,
    getJitFunctionsFromHash,
    EMPTY_HASH,
    AOTRouterCacheMissingError,
    AOTFunctionMissingError,
    hasJitFunctionInCache,
} from '@mionkit/core';
import {RemoteMethod} from '../types/remoteMethods';
import {AnyHandler} from '../types/handlers';
import {IS_TEST_ENV} from '../constants';
import {nullJitFns} from './reflection';
import type {AOTMode} from '../types/general';

export let persistedMethods: MethodsCache = {};
let currentAOTMode: AOTMode = 'auto';

/**
 * Sets the current AOT mode for the methods cache.
 * This is called by initRouter() after validating the mode.
 */
export function setAOTMode(mode: AOTMode): void {
    currentAOTMode = mode;
}

/**
 * Gets the current AOT mode.
 */
export function getAOTMode(): AOTMode {
    return currentAOTMode;
}

// ############# PUBLIC METHODS #############

export function addToPersistedMethods(id: string, method: RemoteMethod) {
    if (!shouldCompile() || !!persistedMethods[id]) return;
    persistedMethods[id] = method;
}

export function getPersistedMethod(id: string, handler: AnyHandler): RemoteMethod | undefined {
    const method = persistedMethods?.[id];
    if (!method) {
        // In strict mode, throw an error if the route is not in the cache
        if (currentAOTMode === 'strict') {
            throw new AOTRouterCacheMissingError(id);
        }
        return;
    }
    return restorePersistedMethod(method, handler, id);
}

export function getPersistedMethods(): Readonly<MethodsCache> {
    return persistedMethods;
}

export function setPersistedMethods(newCompiled: MethodsCache) {
    persistedMethods = newCompiled;
}

export function resetPersistedMethods() {
    persistedMethods = {};
    currentAOTMode = 'auto';
}

function restorePersistedMethod(method: MethodMetadata, handler: AnyHandler, routeId: string): RemoteMethod {
    const restored = method as any as RemoteMethod;
    if (restored.paramsJitFns && restored.returnJitFns && restored.paramNames && !!restored.handler)
        return method as RemoteMethod;

    // In strict mode, validate that JIT functions exist in the cache before restoring
    if (currentAOTMode === 'strict') {
        if (method.paramsJitHash !== EMPTY_HASH && !hasJitFunctionInCache(method.paramsJitHash)) {
            throw new AOTFunctionMissingError(routeId, method.paramsJitHash);
        }
        if (method.returnJitHash !== EMPTY_HASH && !hasJitFunctionInCache(method.returnJitHash)) {
            throw new AOTFunctionMissingError(routeId, method.returnJitHash);
        }
    }

    restored.handler = handler;
    restored.paramsJitFns = method.paramsJitHash === EMPTY_HASH ? nullJitFns : getJitFunctionsFromHash(method.paramsJitHash);
    restored.returnJitFns = method.returnJitHash === EMPTY_HASH ? nullJitFns : getJitFunctionsFromHash(method.returnJitHash);
    if (IS_TEST_ENV) (restored as any).isRestored = true;
    return restored;
}

function shouldCompile() {
    return getENV('MION_COMPILE') === 'true';
}

/**
 * Loads compiled methods data into the persistedMethods cache.
 * This function merges the provided methods data into the existing persistedMethods without overwriting existing entries.
 * @param compiledMethods - Object containing compiled methods data to merge into the cache
 */
export function loadCompiledMethods(compiledMethods: MethodsCache) {
    for (const [key, value] of Object.entries(compiledMethods)) {
        if (!(key in persistedMethods)) {
            persistedMethods[key] = value;
        }
    }
}

// ############# AOT CACHE LOADING #############
