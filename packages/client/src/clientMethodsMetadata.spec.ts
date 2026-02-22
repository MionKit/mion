/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {vi, describe, beforeEach, afterEach, it, expect} from 'vitest';
import {fetchRemoteMethodsMetadata, resetClientCaches} from './clientMethodsMetadata.ts';
import {ClientOptions} from './types.ts';
import {routesCache} from '@mionkit/core';
import Storage from 'dom-storage';
import {TEST_SERVER_BASE_URL_JSON} from '../globalSetup.ts';

// Setup real localStorage for testing
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('fetchRemoteMethodsMetadata', () => {
    const baseURL = TEST_SERVER_BASE_URL_JSON;

    let options: ClientOptions;

    beforeEach(() => {
        options = {
            baseURL,
            fetchOptions: {},
            prefix: '',
            suffix: '',
            validateParams: true,
            autoGenerateErrorId: false,
            serializer: 'stringifyJson',
        };

        // Clear localStorage
        localStorage.clear();
    });

    afterEach(() => {
        resetClientCaches();
    });

    it('should fetch and restore JIT functions from real server', async () => {
        // Fetch metadata for a real route from test server
        await fetchRemoteMethodsMetadata(['sayHello'], options);

        // Verify method metadata was stored in routesCache
        expect(routesCache.hasMetadata('sayHello')).toBe(true);

        const methodMeta = routesCache.getMetadata('sayHello');
        expect(methodMeta).toBeDefined();
        expect(methodMeta?.id).toBe('sayHello');

        // Verify JIT functions are available via getMethodJitFns
        const methodWithJitFns = routesCache.getMethodJitFns('sayHello');
        expect(methodWithJitFns).toBeDefined();
        expect(methodWithJitFns!.paramsJitFns).toBeDefined();
        expect(methodWithJitFns!.paramsJitFns.isType).toBeDefined();

        // Verify JIT functions have the expected structure
        const isValidUser = methodWithJitFns!.paramsJitFns.isType;
        expect(typeof isValidUser).toBe('object');
        expect(isValidUser).toHaveProperty('fn');
        expect(typeof isValidUser.fn).toBe('function');
    });

    it('should handle multiple routes with different validation types', async () => {
        // Fetch metadata for multiple routes from test server with different validation types
        await fetchRemoteMethodsMetadata(['sayHello', 'calculateAge', 'createProduct'], options);

        // Verify all methods were fetched
        expect(routesCache.hasMetadata('sayHello')).toBe(true);
        expect(routesCache.hasMetadata('calculateAge')).toBe(true);
        expect(routesCache.hasMetadata('createProduct')).toBe(true);

        // Test sayHello validation - parameters must be passed as array
        const sayHelloJit = routesCache.getMethodJitFns('sayHello')!;
        const user = {name: 'John', surname: 'Doe'};
        expect(sayHelloJit.paramsJitFns.isType.fn([user])).toBe(true);

        // Test calculateAge validation - parameters must be passed as array
        const calculateAgeJit = routesCache.getMethodJitFns('calculateAge')!;
        expect(calculateAgeJit.paramsJitFns.isType.fn([1990])).toBe(true);
        expect(calculateAgeJit.paramsJitFns.isType.fn(['1990'])).toBe(false);

        // Test createProduct validation - parameters must be passed as array
        const createProductJit = routesCache.getMethodJitFns('createProduct')!;
        const product = {id: '123', name: 'Test Product', price: 99.99};
        expect(createProductJit.paramsJitFns.isType.fn([product])).toBe(true);
        expect(createProductJit.paramsJitFns.isType.fn([{invalid: 'object'}])).toBe(false);
    });

    // The restoreAllDependencies function needs to be called to restore JIT functions before methods can be properly restored.
    // Currently the test clears caches but doesn't call restoreAllDependencies.
    it('should store and restore from localStorage', async () => {
        // First call - fetch from server
        await fetchRemoteMethodsMetadata(['sayHello'], options);

        // Verify method was stored in routesCache
        expect(routesCache.hasMetadata('sayHello')).toBe(true);

        // Verify data was stored in localStorage
        const storageKey = `mionkit:client:serialized-method-data:${baseURL}:sayHello`;
        const storedData = localStorage.getItem(storageKey);
        expect(storedData).toBeTruthy();

        // Clear the caches to simulate app restart (but keep localStorage)
        resetClientCaches();

        // Second call - should restore from localStorage without making HTTP request
        const originalFetch = global.fetch;
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        try {
            await fetchRemoteMethodsMetadata(['sayHello'], options);

            // Verify fetch was not called (data restored from localStorage)
            expect(mockFetch).not.toHaveBeenCalled();

            // Verify method is still available in routesCache
            expect(routesCache.hasMetadata('sayHello')).toBe(true);

            // Verify JIT functions are available
            const methodWithJitFns = routesCache.getMethodJitFns('sayHello');
            expect(methodWithJitFns).toBeDefined();
            expect(methodWithJitFns!.paramsJitFns).toBeDefined();
        } finally {
            // Restore original fetch
            global.fetch = originalFetch;
        }
    });

    it('should handle non-existent routes gracefully', async () => {
        // Try to fetch metadata for a route that doesn't exist
        // The function should complete without throwing but not store any metadata
        await fetchRemoteMethodsMetadata(['nonExistentRoute'], options);

        // Verify no metadata was stored for the non-existent route
        expect(routesCache.hasMetadata('nonExistentRoute')).toBe(false);
    });

    it('should not fetch if method already exists locally', async () => {
        // First fetch
        await fetchRemoteMethodsMetadata(['sayHello'], options);

        // Verify method exists in routesCache
        expect(routesCache.hasMetadata('sayHello')).toBe(true);

        // Mock fetch to track calls (we can do this for this specific test)
        const originalFetch = global.fetch;
        const mockFetch = vi.fn();
        global.fetch = mockFetch;

        try {
            // Second fetch - should not make HTTP request
            await fetchRemoteMethodsMetadata(['sayHello'], options);

            // Verify fetch was not called
            expect(mockFetch).not.toHaveBeenCalled();
        } finally {
            // Restore original fetch
            global.fetch = originalFetch;
        }
    });
});
