/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {JitCompiledFunctions, JitFunctionsHashes} from '@mionkit/core';
import {memorize} from '@mionkit/run-types';
import {NonRawMethod, MethodData} from './types/remoteMethods';
import {AnyHandler} from './types/handlers';
import {IS_TEST_ENV} from './constants';
import {jitUtils} from '@mionkit/core';
import {getENV} from '@mionkit/core';

export type PersistedMethods = Record<string, MethodData>;
export let persistedMethods: PersistedMethods = {};

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

export function getPersistedMethods(): Readonly<PersistedMethods> {
    return persistedMethods;
}

export function setPersistedMethods(newCompiled: PersistedMethods) {
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
    const toJsonVal = jitUtils.getJIT(jitFns.toJsonVal);
    const fromJsonVal = jitUtils.getJIT(jitFns.fromJsonVal);
    const jsonStringify = jitUtils.getJIT(jitFns.jsonStringify);
    if (!isType || !typeErrors || !toJsonVal || !fromJsonVal || !jsonStringify) {
        throw new Error(`Can't restore persisted JIT functions, some jit functions are missing: ${JSON.stringify(jitFns)}`);
    }
    return {isType, typeErrors, toJsonVal, fromJsonVal, jsonStringify};
}

const shouldCompile = memorize(() => getENV('MION_COMPILE') === 'true');

/**
 * Loads compiled methods data into the persistedMethods cache.
 * This function merges the provided methods data into the existing persistedMethods without overwriting existing entries.
 * @param compiledMethods - Object containing compiled methods data to merge into the cache
 */
export function loadCompiledMethods(compiledMethods: PersistedMethods) {
    for (const [key, value] of Object.entries(compiledMethods)) {
        if (!(key in persistedMethods)) {
            persistedMethods[key] = value;
        }
    }
}

// ############# AOT CACHE LOADING #############
