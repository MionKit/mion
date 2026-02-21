/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MethodsCache, MethodMetadata, getENV, getJitFunctionsFromHash} from '@mionkit/core';
import {RemoteMethod} from '../types/remoteMethods.ts';
import {AnyHandler} from '../types/handlers.ts';
import {IS_TEST_ENV} from '../constants.ts';

export let persistedMethods: MethodsCache = {};

// ############# PUBLIC METHODS #############

export function addToPersistedMethods(id: string, method: RemoteMethod) {
    if (!shouldCompile() || !!persistedMethods[id]) return;
    persistedMethods[id] = method;
}

export function getPersistedMethod(id: string, handler: AnyHandler): RemoteMethod | undefined {
    const method = persistedMethods?.[id];
    if (!method) return;
    return restorePersistedMethod(method, handler);
}

/** Gets method metadata from the persisted methods cache by id. */
export function getPersistedMethodMetadata(id: string): MethodMetadata | undefined {
    const method = persistedMethods[id];
    return method;
}

export function getPersistedMethods(): Readonly<MethodsCache> {
    return persistedMethods;
}

export function setPersistedMethods(newCompiled: MethodsCache) {
    persistedMethods = newCompiled;
}

export function resetPersistedMethods() {
    persistedMethods = {};
}

function restorePersistedMethod(method: MethodMetadata, handler: AnyHandler): RemoteMethod {
    const restored = method as any as RemoteMethod;
    if (restored.paramsJitFns && restored.returnJitFns && restored.paramNames && !!restored.handler)
        return method as RemoteMethod;
    restored.handler = handler;
    restored.paramsJitFns = getJitFunctionsFromHash(method.paramsJitHash);
    restored.returnJitFns = getJitFunctionsFromHash(method.returnJitHash);
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
