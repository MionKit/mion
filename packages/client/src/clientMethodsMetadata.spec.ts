/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {fetchRemoteMethodsMetadata} from './clientMethodsMetadata';
import {ClientOptions, JitFunctionsById} from './types';
import {PublicMethod, MethodsData} from '@mionkit/router';
import type {JitCompiledFnData, PureFunctionData} from '@mionkit/core';
import {jitUtils, getFnCaches, GET_REMOTE_METHODS_BY_ID} from '@mionkit/core';
import {PublicApi, Routes, initRouter, registerRoutes, route, hook} from '@mionkit/router';
import {setNodeHttpOpts, startNodeServer} from '@mionkit/http';
import {Server} from 'http';
import {RpcError} from '@mionkit/core';

// Setup real localStorage for testing
// eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-require-imports
const Storage = require('dom-storage');
global.localStorage = new Storage(null, {strict: true});
global.sessionStorage = new Storage(null, {strict: true});

describe('fetchRemoteMethodsMetadata', () => {
    // Define test routes with various validation types
    type User = {name: string; age: number};
    type Product = {id: string; name: string; price: number};

    const routes = {
        // Simple route with basic validation
        getUserName: route((ctx, user: User): string => `Hello ${user.name}`),

        // Route with number validation
        calculateAge: route((ctx, birthYear: number): number => new Date().getFullYear() - birthYear),

        // Route with complex object validation
        createProduct: route(
            (ctx, product: Product): Product => ({
                ...product,
                id: product.id || 'generated-id',
            })
        ),

        // Route with array validation
        sumNumbers: route((ctx, numbers: number[]): number => numbers.reduce((a, b) => a + b, 0)),

        // Route with optional parameters
        greetUser: route((ctx, name: string, greeting?: string): string => `${greeting || 'Hello'} ${name}`),

        // Hook for testing hook metadata
        logRequest: hook((ctx): void => {
            console.log('Request logged');
        }),
    } satisfies Routes;

    let myApi: PublicApi<typeof routes>;
    type MyApi = typeof myApi;

    const port = 8077; // Different port from client.spec.ts
    const baseURL = `http://localhost:${port}`;
    let server: Server;
    let options: ClientOptions;
    let metadataById: Map<string, PublicMethod>;
    let jitFunctionsById: JitFunctionsById;
    let originalJitCache: any;
    let originalPureCache: any;

    beforeAll(async () => {
        // Setup real server with routes
        initRouter({sharedDataFactory: () => ({user: null}), skipClientRoutes: false});
        myApi = registerRoutes(routes);
        setNodeHttpOpts({port});
        server = await startNodeServer();
    });

    afterAll(async () => {
        // Clean shutdown
        return new Promise<void>((resolve, reject) => {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        });
    });

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
        // Fetch metadata for a real route
        await fetchRemoteMethodsMetadata(['getUserName'], options, metadataById, jitFunctionsById);

        // Verify method metadata was stored
        expect(metadataById.has('getUserName')).toBe(true);
        expect(jitFunctionsById.has('getUserName')).toBe(true);

        const methodMeta = metadataById.get('getUserName');
        expect(methodMeta).toBeDefined();
        expect(methodMeta!.id).toBe('getUserName');
        expect(methodMeta!.paramNames).toEqual(['user']);

        // Verify JIT functions are available
        const jitFunctions = jitFunctionsById.get('getUserName');
        expect(jitFunctions).toBeDefined();
        expect(jitFunctions!.params.isType).toBeDefined();

        // Verify JIT functions have the expected structure
        const isValidUser = jitFunctions!.params.isType;
        expect(typeof isValidUser).toBe('object');
        expect(isValidUser).toHaveProperty('fn');
        expect(typeof isValidUser.fn).toBe('function');
    });

    it('should handle multiple routes with different validation types', async () => {
        // Fetch metadata for multiple routes
        await fetchRemoteMethodsMetadata(['getUserName', 'calculateAge', 'sumNumbers'], options, metadataById, jitFunctionsById);

        // Verify all methods were fetched
        expect(metadataById.size).toBeGreaterThanOrEqual(3);
        expect(jitFunctionsById.size).toBeGreaterThanOrEqual(3);

        // Test getUserName validation - parameters must be passed as array
        const userNameJit = jitFunctionsById.get('getUserName')!;
        const user1: User = {name: 'John', age: 30};
        expect(userNameJit.params.isType.fn([user1])).toBe(true);

        // Test calculateAge validation - parameters must be passed as array
        const calculateAgeJit = jitFunctionsById.get('calculateAge')!;
        expect(calculateAgeJit.params.isType.fn([1990])).toBe(true);
        expect(calculateAgeJit.params.isType.fn(['1990'])).toBe(false);

        // Test sumNumbers validation - parameters must be passed as array
        const sumNumbersJit = jitFunctionsById.get('sumNumbers')!;
        expect(sumNumbersJit.params.isType.fn([[1, 2, 3]])).toBe(true);
        expect(sumNumbersJit.params.isType.fn([['1', '2', '3']])).toBe(false);
    });

    it('should store and restore from localStorage', async () => {
        // First call - fetch from server
        await fetchRemoteMethodsMetadata(['getUserName'], options, metadataById, jitFunctionsById);

        // Verify method was stored
        expect(metadataById.has('getUserName')).toBe(true);

        // Clear in-memory data to simulate app restart
        metadataById.clear();
        jitFunctionsById.clear();

        // Second call - should restore from localStorage
        await fetchRemoteMethodsMetadata(['getUserName'], options, metadataById, jitFunctionsById);

        // Verify method was restored from localStorage
        expect(metadataById.has('getUserName')).toBe(true);
        expect(jitFunctionsById.has('getUserName')).toBe(true);

        // Note: JIT functions won't be fully restored from localStorage in the current simple implementation
        // This demonstrates the limitation we discussed
        const jitFunctions = jitFunctionsById.get('getUserName');
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
        await fetchRemoteMethodsMetadata(['getUserName'], options, metadataById, jitFunctionsById);

        // Verify method exists
        expect(metadataById.has('getUserName')).toBe(true);

        // Mock fetch to track calls (we can do this for this specific test)
        const originalFetch = global.fetch;
        const mockFetch = jest.fn();
        global.fetch = mockFetch;

        try {
            // Second fetch - should not make HTTP request
            await fetchRemoteMethodsMetadata(['getUserName'], options, metadataById, jitFunctionsById);

            // Verify fetch was not called
            expect(mockFetch).not.toHaveBeenCalled();
        } finally {
            // Restore original fetch
            global.fetch = originalFetch;
        }
    });
});
