import {describe, it, expect, beforeAll} from 'vitest';
import {resetHashes, resetJitFnCaches, addAOTCaches, getJitUtils} from '@mionkit/core';
import {PURE_SERVER_FN_NAMESPACE} from '@mionkit/core';

// Import the virtual module - Vite plugin automatically scans test-client/src
import {pureFnsCache} from 'virtual:mion-server-pure-fns';

beforeAll(() => {
    resetHashes();
    resetJitFnCaches();
    // Register the pure functions from the virtual module into core
    addAOTCaches({}, pureFnsCache);
});

describe('E2E: Server loads virtual module via Vite plugin', () => {
    it('should have pure functions automatically extracted from client source', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        expect(namespaceCache).toBeDefined();

        const bodyHashes = Object.keys(namespaceCache);
        expect(bodyHashes.length).toBeGreaterThanOrEqual(4);

        // All functions should be registered in core
        for (const bodyHash of bodyHashes) {
            expect(jitUtils.hasPureFn(PURE_SERVER_FN_NAMESPACE, bodyHash)).toBe(true);
        }
    });

    it('should execute addOne function', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        // Find the addOne function by its code pattern
        const addOneHash = Object.keys(namespaceCache).find((hash) => namespaceCache[hash].code.includes('x + 1'));

        expect(addOneHash).toBeDefined();

        const addOneFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, addOneHash!);
        expect(addOneFn(5)).toBe(6);
        expect(addOneFn(0)).toBe(1);
        expect(addOneFn(-1)).toBe(0);
    });

    it('should execute mapUsersToPreferences function', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        const mapFnHash = Object.keys(namespaceCache).find((hash) => namespaceCache[hash].code.includes('userId'));

        expect(mapFnHash).toBeDefined();

        const mapFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, mapFnHash!);
        const users = [
            {id: 1, name: 'Alice', preferences: {theme: 'dark'}},
            {id: 2, name: 'Bob', preferences: {theme: 'light'}},
        ];

        expect(mapFn(users)).toEqual([
            {userId: 1, prefs: {theme: 'dark'}},
            {userId: 2, prefs: {theme: 'light'}},
        ]);
    });

    it('should execute combineArrays function', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        const combineHash = Object.keys(namespaceCache).find((hash) => namespaceCache[hash].code.includes('[...a, ...b]'));

        expect(combineHash).toBeDefined();

        const combineFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, combineHash!);
        expect(combineFn([1, 2], [3, 4])).toEqual([1, 2, 3, 4]);
    });

    it('should execute filterByThreshold function', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        const filterHash = Object.keys(namespaceCache).find((hash) => namespaceCache[hash].code.includes('threshold'));

        expect(filterHash).toBeDefined();

        const filterFn = jitUtils.usePureFn(PURE_SERVER_FN_NAMESPACE, filterHash!);
        const items = [
            {name: 'low', value: 5},
            {name: 'high', value: 15},
            {name: 'medium', value: 10},
            {name: 'very-high', value: 100},
        ];

        expect(filterFn(items)).toEqual([
            {name: 'high', value: 15},
            {name: 'very-high', value: 100},
        ]);
    });

    it('should produce valid bodyHashes that match between virtual module and core cache', () => {
        const jitUtils = getJitUtils();
        const namespaceCache = pureFnsCache[PURE_SERVER_FN_NAMESPACE];

        // Verify bodyHash matches between virtual module and core cache
        for (const bodyHash of Object.keys(namespaceCache)) {
            const compiled = jitUtils.getCompiledPureFn(PURE_SERVER_FN_NAMESPACE, bodyHash);
            expect(compiled).toBeDefined();
            expect(compiled?.bodyHash).toBe(bodyHash);
        }
    });
});
