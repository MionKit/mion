/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fetchRemoteMethodsMetadata} from './clientMethodsMetadata';
import {ClientOptions, JitFunctionsById} from './types';
import {PublicMethod} from '@mionkit/router';
import {getFnCaches} from '@mionkit/core';
import {createTestServerHooks} from '../test/test-server-utils';

// Setup real localStorage for testing
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('fetchRemoteMethodsMetadata', () => {
    const port = 8077; // Different port from client.spec.ts

    // Create server hooks using the utility with logging enabled for debugging
    const serverHooks = createTestServerHooks({port, logOutput: true});
    const baseURL = serverHooks.getBaseURL();

    let options: ClientOptions;
    let metadataById: Map<string, PublicMethod>;
    let jitFunctionsById: JitFunctionsById;
    let originalJitCache: any;
    let originalPureCache: any;

    beforeAll(serverHooks.beforeAll, 15000); // 15 second timeout for server startup
    afterAll(serverHooks.afterAll, 10000); // 10 second timeout for server shutdown

    beforeEach(() => {
        options = {
            baseURL,
            storage: 'localStorage',
            fetchOptions: {},
            prefix: '',
            suffix: '',
            validateParams: true,
            deserializeParams: true,
            autoGenerateErrorId: false,
            bodyParser: JSON,
        };
        metadataById = new Map();
        jitFunctionsById = new Map();

        // Store original cache state
        const caches = getFnCaches();
        originalJitCache = {...caches.jitFnsCache};
        originalPureCache = {...caches.pureFnsCache};

        // Clear localStorage
        localStorage.clear();
    });

    afterEach(() => {
        // Clean up test functions from caches
        const caches = getFnCaches();
        Object.keys(caches.jitFnsCache).forEach((key) => {
            if (!originalJitCache[key]) {
                delete (caches.jitFnsCache as any)[key];
            }
        });
        Object.keys(caches.pureFnsCache).forEach((key) => {
            if (!originalPureCache[key]) {
                delete (caches.pureFnsCache as any)[key];
            }
        });
    });

    it('should fetch and restore JIT functions from real server', async () => {
        // Fetch metadata for a real route from test server
        await fetchRemoteMethodsMetadata(['sayHello'], options, metadataById, jitFunctionsById);

        // Verify method metadata was stored
        expect(metadataById.has('sayHello')).toBe(true);
        expect(jitFunctionsById.has('sayHello')).toBe(true);

        const methodMeta = metadataById.get('sayHello');
        expect(methodMeta).toBeDefined();

        // Verify JIT functions are available
        const jitFunctions = jitFunctionsById.get('sayHello');
        expect(jitFunctions).toBeDefined();
        expect(jitFunctions!.params.isType).toBeDefined();

        // Verify JIT functions have the expected structure
        const isValidUser = jitFunctions!.params.isType;
        expect(typeof isValidUser).toBe('object');
        expect(isValidUser).toHaveProperty('fn');
        expect(typeof isValidUser.fn).toBe('function');
    });

    it('should handle multiple routes with different validation types', async () => {
        // Fetch metadata for multiple routes from test server with different validation types
        await fetchRemoteMethodsMetadata(['sayHello', 'calculateAge', 'createProduct'], options, metadataById, jitFunctionsById);

        // Verify all methods were fetched
        expect(metadataById.size).toBeGreaterThanOrEqual(3);
        expect(jitFunctionsById.size).toBeGreaterThanOrEqual(3);

        // Test sayHello validation - parameters must be passed as array
        const sayHelloJit = jitFunctionsById.get('sayHello')!;
        const user = {name: 'John', surname: 'Doe'};
        expect(sayHelloJit.params.isType.fn([user])).toBe(true);

        // Test calculateAge validation - parameters must be passed as array
        const calculateAgeJit = jitFunctionsById.get('calculateAge')!;
        expect(calculateAgeJit.params.isType.fn([1990])).toBe(true);
        expect(calculateAgeJit.params.isType.fn(['1990'])).toBe(false);

        // Test createProduct validation - parameters must be passed as array
        const createProductJit = jitFunctionsById.get('createProduct')!;
        const product = {id: '123', name: 'Test Product', price: 99.99};
        expect(createProductJit.params.isType.fn([product])).toBe(true);
        expect(createProductJit.params.isType.fn([{invalid: 'object'}])).toBe(false);
    });

    it('should store and restore from localStorage', async () => {
        // First call - fetch from server
        await fetchRemoteMethodsMetadata(['sayHello'], options, metadataById, jitFunctionsById);

        // Verify method was stored
        expect(metadataById.has('sayHello')).toBe(true);

        // Clear in-memory data to simulate app restart
        metadataById.clear();
        jitFunctionsById.clear();

        // Second call - should restore from localStorage
        await fetchRemoteMethodsMetadata(['sayHello'], options, metadataById, jitFunctionsById);

        // Verify method was restored from localStorage
        expect(metadataById.has('sayHello')).toBe(true);
        expect(jitFunctionsById.has('sayHello')).toBe(true);

        // Note: JIT functions won't be fully restored from localStorage in the current simple implementation
        // This demonstrates the limitation we discussed
        const jitFunctions = jitFunctionsById.get('sayHello');
        expect(jitFunctions).toBeDefined();
        // The isType function will be a placeholder/noop function when restored from localStorage
    });

    it('should handle non-existent routes gracefully', async () => {
        // Try to fetch metadata for a route that doesn't exist
        // The function should complete without throwing but not store any metadata
        await fetchRemoteMethodsMetadata(['nonExistentRoute'], options, metadataById, jitFunctionsById);

        // Verify no metadata was stored for the non-existent route
        expect(metadataById.has('nonExistentRoute')).toBe(false);
        expect(jitFunctionsById.has('nonExistentRoute')).toBe(false);
    });

    it('should not fetch if method already exists locally', async () => {
        // First fetch
        await fetchRemoteMethodsMetadata(['sayHello'], options, metadataById, jitFunctionsById);

        // Verify method exists
        expect(metadataById.has('sayHello')).toBe(true);

        // Mock fetch to track calls (we can do this for this specific test)
        const originalFetch = global.fetch;
        const mockFetch = jest.fn();
        global.fetch = mockFetch;

        try {
            // Second fetch - should not make HTTP request
            await fetchRemoteMethodsMetadata(['sayHello'], options, metadataById, jitFunctionsById);

            // Verify fetch was not called
            expect(mockFetch).not.toHaveBeenCalled();
        } finally {
            // Restore original fetch
            global.fetch = originalFetch;
        }
    });
});
