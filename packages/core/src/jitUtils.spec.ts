/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {loadJitCachesCaches, getFnCaches} from './jitUtils';

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
                closureFn: () => () => true,
            },
        };

        // Get initial cache state
        const initialCaches = getFnCaches();
        const initialJitCacheSize = Object.keys(initialCaches.jitFnsCache).length;

        // Load the compiled cache
        loadJitCachesCaches({jitFnsCache: testJitCache});

        // Verify the cache was loaded
        const updatedCaches = getFnCaches();
        const updatedJitCacheSize = Object.keys(updatedCaches.jitFnsCache).length;

        expect(updatedJitCacheSize).toBeGreaterThan(initialJitCacheSize);
        expect(updatedCaches.jitFnsCache).toHaveProperty('testJitFn');
    });

    it('should load compiled pure functions cache from cache data', () => {
        // Create a test pure functions cache data
        const testPureCache = {
            testPureFn: {
                paramNames: ['a', 'b'],
                pureFnHash: 'testPureFn',
                code: 'return (a, b) => a + b;',
                dependencies: new Set<string>(),
                closureFn: () => (a: number, b: number) => a + b,
                fn: (a: number, b: number) => a + b,
            },
        };

        // Get initial cache state
        const initialCaches = getFnCaches();
        const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

        // Load the compiled cache
        loadJitCachesCaches({pureFnsCache: testPureCache});

        // Verify the cache was loaded
        const updatedCaches = getFnCaches();
        const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

        expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
        expect(updatedCaches.pureFnsCache).toHaveProperty('testPureFn');
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
                closureFn: () => () => true,
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
                closureFn: () => () => false,
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
                closureFn: () => () => false,
            },
        };

        // Load first cache
        loadJitCachesCaches({jitFnsCache: firstCache});

        const cachesAfterFirst = getFnCaches();
        expect(cachesAfterFirst.jitFnsCache).toHaveProperty('testFn1');
        expect(cachesAfterFirst.jitFnsCache.testFn1?.typeName).toBe('TestType1');

        // Load second cache - should not overwrite testFn1 but should add testFn2
        loadJitCachesCaches({jitFnsCache: secondCache});

        const cachesAfterSecond = getFnCaches();
        expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn1');
        expect(cachesAfterSecond.jitFnsCache).toHaveProperty('testFn2');
        // testFn1 should still have the original value (not overwritten)
        expect(cachesAfterSecond.jitFnsCache.testFn1?.typeName).toBe('TestType1');
        expect(cachesAfterSecond.jitFnsCache.testFn2?.typeName).toBe('TestType2');
    });
});
