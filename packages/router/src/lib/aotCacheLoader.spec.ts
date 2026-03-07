/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach, vi} from 'vitest';
import {
    HandlerType,
    EMPTY_HASH,
    resetJitFnCaches,
    getJitFunctionsFromHash,
    routesCache,
    resetRoutesCache,
    getJitUtils,
} from '@mionjs/core';
import {getPersistedMethods, resetPersistedMethods} from './methodsCache.ts';
import type {MethodsCache, PersistedJitFunctionsCache} from '@mionjs/core';
import {
    cpf_asJSONString,
    cpf_getUnknownKeysFromArray,
    cpf_hasUnknownKeysFromArray,
    cpf_newRunTypeErr,
    cpf_formatErr,
    cpf_safeIterableKey,
    cpf_sanitizeCompiledFn,
} from '@mionjs/run-types';

const JIT_FN_IDS = ['is', 'te', 'tj', 'fj', 'sj', 'tBi', 'fBi'];

const MOCK_JIT_HASH = 'aot-loader-test-hash-12345';

const createMockPersistedJitFn = (hash: string, fnID: string): any => ({
    jitFnHash: hash,
    typeName: 'TestType',
    fnID,
    args: {vλl: 'value'},
    defaultParamValues: {vλl: ''},
    code: 'return value;',
    jitDependencies: new Set(),
    pureFnDependencies: new Set(),
    createJitFn: () => (value: any) => value,
    fn: undefined,
});

const mockJitFnsCache: PersistedJitFunctionsCache = Object.fromEntries(
    JIT_FN_IDS.map((fnID) => {
        const fullHash = `${fnID}_${MOCK_JIT_HASH}`;
        return [fullHash, createMockPersistedJitFn(fullHash, fnID)];
    })
) as PersistedJitFunctionsCache;

const mockRouterCache: MethodsCache = {
    testRoute: {
        type: HandlerType.route,
        id: 'testRoute',
        nestLevel: 0,
        isAsync: false,
        hasReturnData: true,
        paramNames: ['name'],
        paramsJitHash: MOCK_JIT_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['testRoute'],
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
};

/** Re-registers run-types pure functions after resetJitFnCaches() */
function reRegisterRunTypesPureFns(): void {
    const {addPureFn} = getJitUtils();
    addPureFn('mion', cpf_asJSONString);
    addPureFn('mion', cpf_getUnknownKeysFromArray);
    addPureFn('mion', cpf_hasUnknownKeysFromArray);
    addPureFn('mion', cpf_newRunTypeErr);
    addPureFn('mion', cpf_formatErr);
    addPureFn('mion', cpf_safeIterableKey);
    addPureFn('mion', cpf_sanitizeCompiledFn);
}

// Mock virtual:mion-aot/caches to return test data instead of empty noop caches
vi.mock('virtual:mion-aot/caches', () => ({
    jitFnsCache: mockJitFnsCache,
    pureFnsCache: {},
    routerCache: mockRouterCache,
}));

describe('aotCacheLoader', () => {
    beforeEach(() => {
        resetJitFnCaches();
        resetRoutesCache();
        resetPersistedMethods();
        reRegisterRunTypesPureFns();
    });

    it('should load JIT functions from virtual module into global jit cache', async () => {
        const {loadAOTCaches} = await import('./aotCacheLoader.ts');
        loadAOTCaches();

        const jitFns = getJitFunctionsFromHash(MOCK_JIT_HASH);
        expect(jitFns).toBeDefined();
        expect(jitFns.isType).toBeDefined();
        expect(jitFns.typeErrors).toBeDefined();
    });

    it('should load router cache from virtual module into global routes cache', async () => {
        const {loadAOTCaches} = await import('./aotCacheLoader.ts');
        loadAOTCaches();

        const metadata = routesCache.getMetadata('testRoute');
        expect(metadata).toBeDefined();
        expect(metadata?.paramNames).toEqual(['name']);
        expect(metadata?.paramsJitHash).toBe(MOCK_JIT_HASH);
    });

    it('should load router cache into persisted methods cache', async () => {
        const {loadAOTCaches} = await import('./aotCacheLoader.ts');
        loadAOTCaches();

        const persisted = getPersistedMethods();
        expect(persisted['testRoute']).toBeDefined();
        expect(persisted['testRoute'].id).toBe('testRoute');
        expect(persisted['testRoute'].paramsJitHash).toBe(MOCK_JIT_HASH);
    });

    it('should populate both jit and routes caches so getMethodJitFns works end-to-end', async () => {
        const {loadAOTCaches} = await import('./aotCacheLoader.ts');
        loadAOTCaches();

        const methodWithJit = routesCache.getMethodJitFns('testRoute');
        expect(methodWithJit).toBeDefined();
        expect(methodWithJit?.paramsJitFns).toBeDefined();
        expect(methodWithJit?.paramsJitFns.isType).toBeDefined();
    });
});
