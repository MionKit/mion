/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiledFunctions, JitFunctionsHashes} from '@mionkit/core';
import {NonRawMethod, MethodsCache, MethodData} from './types/remoteMethods';
import {AnyHandler} from './types/handlers';
import {IS_TEST_ENV} from './constants';
import {jitUtils} from '@mionkit/core';
import {getENV} from '@mionkit/core';

export let persistedMethods: MethodsCache = {};

// ############# PUBLIC METHODS #############

export function addToPersistedMethods(id: string, method: NonRawMethod) {
    if (!shouldCompile() || !!persistedMethods[id]) return;
    persistedMethods[id] = method;
}

export function getPersistedMethod(id: string, handler: AnyHandler): NonRawMethod | undefined {
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

function restorePersistedMethod(method: MethodData, handler: AnyHandler): NonRawMethod {
    const restored = method as any as NonRawMethod;
    if (restored.paramsJitFns && restored.returnJitFns && restored.paramNames && !!restored.handler)
        return method as NonRawMethod;
    restored.handler = handler;
    restored.paramsJitFns = restorePersistedJitFunctions(method.paramsJitHashes);
    restored.returnJitFns = restorePersistedJitFunctions(method.returnJitHashes);
    if (IS_TEST_ENV) (restored as any).isRestored = true;
    return restored;
}

function restorePersistedJitFunctions(jitFns: JitFunctionsHashes): JitCompiledFunctions {
    const isType = jitUtils.getJIT(jitFns.isType);
    const typeErrors = jitUtils.getJIT(jitFns.typeErrors);
    const prepareForJson = jitUtils.getJIT(jitFns.prepareForJson);
    const restoreFromJson = jitUtils.getJIT(jitFns.restoreFromJson);
    const jsonStringify = jitUtils.getJIT(jitFns.jsonStringify);
    const toBinary = jitUtils.getJIT(jitFns.toBinary);
    const fromBinary = jitUtils.getJIT(jitFns.fromBinary);
    if (!isType || !typeErrors || !prepareForJson || !restoreFromJson || !jsonStringify || !toBinary || !fromBinary) {
        throw new Error(`Can't restore persisted JIT functions, some jit functions are missing: ${JSON.stringify(jitFns)}`);
    }
    return {isType, typeErrors, prepareForJson, restoreFromJson, jsonStringify, toBinary, fromBinary};
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
