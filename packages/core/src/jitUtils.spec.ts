/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {getJitFnCaches} from './jitUtils';
import {JitFunctionsCache, PureFunctionsCache} from './types/general.types';

const {jitFnsCache, pureFnsCache} = getJitFnCaches() as {jitFnsCache: JitFunctionsCache; pureFnsCache: PureFunctionsCache};

/**
 * Loads compiled JIT and pure functions into the respective caches.
 * This function merges the provided cache data into the existing caches without overwriting existing entries.
 * @param caches - Object containing JIT and pure function cache data to merge
 */
function loadJitCachesCaches(caches: {jitFnsCache?: JitFunctionsCache; pureFnsCache?: PureFunctionsCache}) {
    if (caches.jitFnsCache) {
        for (const [key, value] of Object.entries(caches.jitFnsCache)) {
            if (!(key in jitFnsCache)) {
                jitFnsCache[key] = value;
            }
        }
    }
    if (caches.pureFnsCache) {
        for (const [key, value] of Object.entries(caches.pureFnsCache)) {
            if (!(key in pureFnsCache)) {
                pureFnsCache[key] = value;
            }
        }
    }
}

describe('jitUtils', () => {
    it('should load compiled JIT functions cache from cache data', () => {
        // Create a test JIT cache data
        const testJitCache = {
            testJitFn: {
                typeName: 'TestType',
                fnID: 'isType',
                jitFnHash: 'testJitFn',
                args: {vλl: 'v'},
                defaultParamValues: {vλl: ''},
                code: 'return true;',
                dependenciesSet: new Set<string>(),
                pureFnDependencies: new Set<string>(),
                fn: () => true,
                createJitFn: () => () => true,
            },
        };

        // Get initial cache state
        const initialCaches = getJitFnCaches();
        const initialJitCacheSize = Object.keys(initialCaches.jitFnsCache).length;

        // Load the compiled cache
        loadJitCachesCaches({jitFnsCache: testJitCache});

        // Verify the cache was loaded
        const updatedCaches = getJitFnCaches();
        const updatedJitCacheSize = Object.keys(updatedCaches.jitFnsCache).length;

        expect(updatedJitCacheSize).toBeGreaterThan(initialJitCacheSize);
        expect(updatedCaches.jitFnsCache).toHaveProperty('testJitFn');
    });

    it('should load compiled pure functions cache from cache data', () => {
        // Create a test pure functions cache data (namespaced structure)
        const testPureCache: PureFunctionsCache = {
            testNamespace: {
                testPureFn: {
                    namespace: 'testNamespace',
                    paramNames: ['a', 'b'],
                    fnName: 'testPureFn',
                    bodyHash: 'testPureFn_hash',
                    code: 'return (a, b) => a + b;',
                    dependencies: new Set<string>(),
                    createJitFn: () => (a: number, b: number) => a + b,
                    fn: (a: number, b: number) => a + b,
                },
            },
        };

        // Get initial cache state
        const initialCaches = getJitFnCaches();
        const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

        // Load the compiled cache
        loadJitCachesCaches({pureFnsCache: testPureCache});

        // Verify the cache was loaded
        const updatedCaches = getJitFnCaches();
        const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

        expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
        expect(updatedCaches.pureFnsCache).toHaveProperty('testNamespace');
        expect(updatedCaches.pureFnsCache.testNamespace).toHaveProperty('testPureFn');
    });

    it('should handle empty cache data gracefully', () => {
        // This should not throw an error
        expect(() => loadJitCachesCaches({})).not.toThrow();
        expect(() => loadJitCachesCaches({jitFnsCache: {}})).not.toThrow();
        expect(() => loadJitCachesCaches({pureFnsCache: {}})).not.toThrow();
    });

    it('should not overwrite existing cache entries', () => {
        const firstCache = {
            testFn1: {
                typeName: 'TestType1',
                fnID: 'isType',
                jitFnHash: 'testFn1',
                args: {vλl: 'v'},
                defaultParamValues: {vλl: ''},
                code: 'return true;',
                dependenciesSet: new Set<string>(),
                pureFnDependencies: new Set<string>(),
                fn: () => true,
                createJitFn: () => () => true,
            },
        };

        const secondCache = {
            testFn1: {
                // Same key as first cache - should NOT overwrite
                typeName: 'TestType2',
                fnID: 'isType',
                jitFnHash: 'testFn1',
                args: {vλl: 'v'},
                defaultParamValues: {vλl: ''},
                code: 'return false;',
                dependenciesSet: new Set<string>(),
                pureFnDependencies: new Set<string>(),
                fn: () => false,
                createJitFn: () => () => false,
            },
            testFn2: {
                // New key - should be added
                typeName: 'TestType2',
                fnID: 'isType',
                jitFnHash: 'testFn2',
                args: {vλl: 'v'},
                defaultParamValues: {vλl: ''},
                code: 'return false;',
                dependenciesSet: new Set<string>(),
                pureFnDependencies: new Set<string>(),
                fn: () => false,
                createJitFn: () => () => false,
            },
        };

        // Load first cache
        loadJitCachesCaches({jitFnsCache: firstCache});

        const cachesAfterFirst = getJitFnCaches();
        expect(cachesAfterFirst.jitFnsCache).toHaveProperty('testFn1');
        expect(cachesAfterFirst.jitFnsCache.testFn1?.typeName).toBe('TestType1');

        // Load second cache - should not overwrite testFn1 but should add testFn2
        loadJitCachesCaches({jitFnsCache: secondCache});

        const cachesAfterSecond = getJitFnCaches();
        expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn1');
        expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn2');
        // testFn1 should still have the original value (not overwritten)
        expect(cachesAfterSecond.jitFnsCache.testFn1?.typeName).toBe('TestType1');
        expect(cachesAfterSecond.jitFnsCache.testFn2?.typeName).toBe('TestType2');
    });
});
