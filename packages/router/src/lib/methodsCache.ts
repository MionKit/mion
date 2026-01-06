/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {MethodsCache, MethodMetadata, getENV, getJitFunctionsFromHash, EMPTY_HASH} from '@mionkit/core';
import {RemoteMethod} from '../types/remoteMethods';
import {AnyHandler} from '../types/handlers';
import {IS_TEST_ENV} from '../constants';
import {nullJitFns} from './reflection';

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
