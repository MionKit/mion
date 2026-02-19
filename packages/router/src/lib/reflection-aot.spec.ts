/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {resetRouter, initRouter, registerRoutes, getRouteExecutable, getLinkedFnExecutable} from '../router.ts';
import {route, linkedFn, rawLinkedFn} from './handlers.ts';
import {setPersistedMethods, resetPersistedMethods, loadCompiledMethods} from './methodsCache.ts';
import {AOTCacheError, resetRunTypesCache} from './reflection.ts';
import {HandlerType, EMPTY_HASH, resetJitFnCaches, addAOTCaches, getJitFunctionsFromHash} from '@mionkit/core';
import type {Routes} from '../types/general.ts';
import type {MethodsCache, PersistedJitFunctionsCache, PersistedPureFunctionsCache} from '@mionkit/core';
// Import the default router cache from aot-caches package for testing
// IMPORTANT!!! if any of the mion routes/linkedFns are changed we might need to recompile caches or this tests might fails
import {routerCache as aotRouterCache} from '@mionkit/aot-caches';

// Default routes cache from the AOT caches package (contains error routes and client routes)
// Note: Raw linkedFns (mionDeserializeRequest, mionSerializeResponse) don't need to be in the AOT cache
// because they don't use JIT functions - they always use nullJitFns and are handled specially
const defaultRoutesCache: MethodsCache = {
    ...aotRouterCache,
};

describe('AOT Lazy Loading', () => {
    beforeEach(() => {
        resetRouter();
        resetPersistedMethods();
        resetRunTypesCache();
        resetJitFnCaches();
    });

    describe('AOT mode enabled', () => {
        it('should use cached data when route is in AOT cache', async () => {
            // Setup: Pre-populate cache with custom route data BEFORE initRouter
            // This simulates having a complete AOT cache with user routes
            const customRouteCache: MethodsCache = {
                sayHello: {
                    type: HandlerType.route,
                    id: 'sayHello',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['name'],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['sayHello'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(customRouteCache);

            // Initialize router in AOT mode
            // This will load default AOT caches, but won't overwrite our custom route
            await initRouter({aot: true});

            // Register routes - should use cached data
            const routes = {
                sayHello: route((ctx: any, name: string): string => `Hello ${name}`),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the route was created using cached data
            const executable = getRouteExecutable('sayHello');
            expect(executable).toBeDefined();
            expect(executable?.id).toBe('sayHello');
            expect(executable?.hasReturnData).toBe(true);
            expect(executable?.paramNames).toEqual(['name']);
        });

        it('should throw AOTCacheError when route is missing from cache', async () => {
            // Setup: Pre-populate with default routes only (no custom routes)
            setPersistedMethods({...defaultRoutesCache});

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes - should throw because route is not in cache
            const routes = {
                missingRoute: route((ctx: any): string => 'hello'),
            } satisfies Routes;

            await expect(registerRoutes(routes)).rejects.toThrow(AOTCacheError);
            await expect(registerRoutes(routes)).rejects.toThrow('missingRoute');
            await expect(registerRoutes(routes)).rejects.toThrow('Regenerate AOT caches');
        });

        it('should throw AOTCacheError when linkedFn is missing from cache', async () => {
            // Setup: Cache with default routes and route but missing the custom linkedFn
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                sayHello: {
                    type: HandlerType.route,
                    id: 'sayHello',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: [],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['sayHello'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes with a linkedFn that's not in cache
            const routes = {
                missingLinkedFn: linkedFn((ctx: any): void => undefined),
                sayHello: route((ctx: any): string => 'hello'),
            } satisfies Routes;

            await expect(registerRoutes(routes)).rejects.toThrow(AOTCacheError);
            await expect(registerRoutes(routes)).rejects.toThrow('missingLinkedFn');
        });

        it('should NOT throw AOTCacheError for raw linkedFns (they do not need AOT cache)', async () => {
            // Raw linkedFns don't need JIT functions, so they don't need to be in the AOT cache
            // They should work in AOT mode without being in the cache
            setPersistedMethods({...defaultRoutesCache});

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes with a raw linkedFn that's not in cache - should NOT throw
            const routes = {
                myRawLinkedFn: rawLinkedFn((ctx: any, cb: () => void): void => cb()),
            } satisfies Routes;

            // This should succeed because raw linkedFns don't need to be in the AOT cache
            await expect(registerRoutes(routes)).resolves.not.toThrow();
        });

        it('should work with complete AOT cache', async () => {
            // Setup: Complete cache with all routes and linkedFns
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                myLinkedFn: {
                    type: HandlerType.linkedFn,
                    id: 'myLinkedFn',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: false,
                    paramNames: [],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['myLinkedFn'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
                myRoute: {
                    type: HandlerType.route,
                    id: 'myRoute',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['data'],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['myRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes - should succeed with complete cache
            const routes = {
                myLinkedFn: linkedFn((ctx: any): void => undefined),
                myRoute: route((ctx: any, data: string): string => data),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify routes were created
            expect(getLinkedFnExecutable('myLinkedFn')).toBeDefined();
            expect(getRouteExecutable('myRoute')).toBeDefined();
            expect(getRouteExecutable('myRoute')?.paramNames).toEqual(['data']);
        });

        it('should automatically load default AOT caches when aot mode is enabled', async () => {
            // Don't pre-populate any cache - let initRouter load the default caches
            // Initialize router in AOT mode - this should automatically load @mionkit/aot-caches
            await initRouter({aot: true, skipClientRoutes: true});

            // The default error routes should be available from the automatically loaded cache
            // We can verify this by checking that the router initialized successfully
            // (if the default caches weren't loaded, it would throw AOTCacheError for error routes)
            expect(getRouteExecutable('@thrownErrors')).toBeDefined();
            expect(getRouteExecutable('mion@notFound')).toBeDefined();
            expect(getRouteExecutable('mion@platformError')).toBeDefined();
        });
    });

    describe('Non-AOT mode (default)', () => {
        it('should dynamically load run-types when route is not in cache', async () => {
            // Setup: Empty cache
            setPersistedMethods({});

            // Initialize router in non-AOT mode (default)
            await initRouter({aot: false});

            // Register routes - should dynamically load run-types
            const routes = {
                sayHello: route((ctx: any, name: string): string => `Hello ${name}`),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the route was created with reflection data
            const executable = getRouteExecutable('sayHello');
            expect(executable).toBeDefined();
            expect(executable?.id).toBe('sayHello');
            expect(executable?.hasReturnData).toBe(true);
            expect(executable?.paramNames).toEqual(['name']);
        });

        it('should use cached data when available even in non-AOT mode', async () => {
            // Setup: Create mock cache
            const mockCache: MethodsCache = {
                cachedRoute: {
                    type: HandlerType.route,
                    id: 'cachedRoute',
                    nestLevel: 0,
                    isAsync: true, // Different from actual to verify cache is used
                    hasReturnData: false, // Different from actual to verify cache is used
                    paramNames: ['cachedParam'],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['cachedRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in non-AOT mode
            await initRouter({aot: false});

            // Register routes
            const routes = {
                cachedRoute: route((ctx: any, name: string): string => `Hello ${name}`),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the route uses cached data (isAsync and hasReturnData from cache)
            const executable = getRouteExecutable('cachedRoute');
            expect(executable).toBeDefined();
            expect(executable?.isAsync).toBe(true); // From cache
            expect(executable?.hasReturnData).toBe(false); // From cache
            expect(executable?.paramNames).toEqual(['cachedParam']); // From cache
        });

        it('should generate reflection for linkedFns not in cache', async () => {
            // Setup: Empty cache
            setPersistedMethods({});

            // Initialize router in non-AOT mode
            await initRouter({aot: false});

            // Register routes with linkedFns
            const routes = {
                myLinkedFn: linkedFn((ctx: any, data: number): number => data * 2),
                myRoute: route((ctx: any): string => 'hello'),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify linkedFn was created with reflection data
            const linkedFnExecutable = getLinkedFnExecutable('myLinkedFn');
            expect(linkedFnExecutable).toBeDefined();
            expect(linkedFnExecutable?.id).toBe('myLinkedFn');
            expect(linkedFnExecutable?.paramNames).toEqual(['data']);
            expect(linkedFnExecutable?.hasReturnData).toBe(true);
        });
    });

    describe('AOTCacheError', () => {
        it('should have correct error message for routes', () => {
            const error = new AOTCacheError('users/getUser', 'route');
            expect(error.name).toBe('AOTCacheError');
            expect(error.message).toContain('users/getUser');
            expect(error.message).toContain('not found in AOT cache');
            expect(error.message).toContain('mion-build-aot');
        });

        it('should have correct error message for linkedFns', () => {
            const error = new AOTCacheError('auth', 'linkedFn');
            expect(error.name).toBe('AOTCacheError');
            expect(error.message).toContain('LinkedFn');
            expect(error.message).toContain('auth');
        });

        it('should have correct error message for raw linkedFns', () => {
            const error = new AOTCacheError('mionDeserializeRequest', 'rawLinkedFn');
            expect(error.name).toBe('AOTCacheError');
            expect(error.message).toContain('Raw linkedFn');
            expect(error.message).toContain('mionDeserializeRequest');
        });
    });

    describe('Run-types module caching', () => {
        it('should only load run-types once for multiple routes', async () => {
            // Setup: Empty cache
            setPersistedMethods({});

            // Initialize router in non-AOT mode
            await initRouter({aot: false});

            // Register multiple routes
            const routes = {
                route1: route((ctx: any, a: string): string => a),
                route2: route((ctx: any, b: number): number => b),
                route3: route((ctx: any, c: boolean): boolean => c),
            } satisfies Routes;
            await registerRoutes(routes);

            // All routes should be created successfully
            expect(getRouteExecutable('route1')).toBeDefined();
            expect(getRouteExecutable('route2')).toBeDefined();
            expect(getRouteExecutable('route3')).toBeDefined();
        });
    });

    describe('JIT function hash loading', () => {
        // Mock JIT function hashes for testing
        const MOCK_PARAMS_JIT_HASH = 'test-params-jit-hash-12345';
        const MOCK_RETURN_JIT_HASH = 'test-return-jit-hash-67890';

        // JIT function IDs used to generate full hashes
        const JIT_FN_IDS = ['is', 'te', 'tj', 'fj', 'sj', 'tBi', 'fBi'];

        // Helper to create a mock persisted JIT function
        const createMockPersistedJitFn = (hash: string, fnID: string): any => ({
            jitFnHash: hash,
            typeName: 'TestType',
            fnID,
            args: {vλl: 'value'},
            defaultParamValues: {vλl: ''},
            code: 'return value;',
            jitDependencies: new Set(),
            pureFnDependencies: new Set(),
            createJitFn: () => (value: any) => value, // Simple pass-through function
            fn: undefined,
        });

        // Helper to create all JIT functions for a given base hash
        const createMockJitFnsForHash = (baseHash: string): PersistedJitFunctionsCache => {
            const cache: PersistedJitFunctionsCache = {};
            for (const fnID of JIT_FN_IDS) {
                const fullHash = `${fnID}_${baseHash}`;
                cache[fullHash] = createMockPersistedJitFn(fullHash, fnID);
            }
            return cache;
        };

        // Mock JIT function caches with all required function types
        const mockJitFnsCache: PersistedJitFunctionsCache = {
            ...createMockJitFnsForHash(MOCK_PARAMS_JIT_HASH),
            ...createMockJitFnsForHash(MOCK_RETURN_JIT_HASH),
        };

        const mockPureFnsCache: PersistedPureFunctionsCache = {};

        it('should load JIT functions from cache when hashes are non-empty', async () => {
            // Setup: Pre-populate JIT function caches
            addAOTCaches(mockJitFnsCache, mockPureFnsCache);

            // Setup: Pre-populate router cache with non-empty JIT hashes
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                routeWithJitFns: {
                    type: HandlerType.route,
                    id: 'routeWithJitFns',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['data'],
                    paramsJitHash: MOCK_PARAMS_JIT_HASH, // Non-empty hash
                    returnJitHash: MOCK_RETURN_JIT_HASH, // Non-empty hash
                    pointer: ['routeWithJitFns'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes
            const routes = {
                routeWithJitFns: route((ctx: any, data: string): string => data),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the route was created with JIT functions loaded from cache
            const executable = getRouteExecutable('routeWithJitFns');
            expect(executable).toBeDefined();
            expect(executable?.paramsJitFns).toBeDefined();
            expect(executable?.returnJitFns).toBeDefined();

            // Verify the JIT functions are the ones from the cache (not null)
            // The JIT functions should have been loaded from the cache using getJitFunctionsFromHash
            const paramsJitFns = getJitFunctionsFromHash(MOCK_PARAMS_JIT_HASH);
            const returnJitFns = getJitFunctionsFromHash(MOCK_RETURN_JIT_HASH);
            expect(paramsJitFns).toBeDefined();
            expect(returnJitFns).toBeDefined();
        });

        it('should throw error when JIT hash is not found in cache (AOT mode)', async () => {
            // Setup: Pre-populate router cache with non-empty JIT hashes but DON'T add to JIT cache
            const MISSING_JIT_HASH = 'missing-jit-hash-not-in-cache';
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                routeWithMissingJit: {
                    type: HandlerType.route,
                    id: 'routeWithMissingJit',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['data'],
                    paramsJitHash: MISSING_JIT_HASH, // Hash not in JIT cache
                    returnJitHash: EMPTY_HASH,
                    pointer: ['routeWithMissingJit'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes - should throw because JIT function is not in cache
            const routes = {
                routeWithMissingJit: route((ctx: any, data: string): string => data),
            } satisfies Routes;

            // This should throw an error because the JIT function hash is not found
            await expect(registerRoutes(routes)).rejects.toThrow();
        });

        it('should work with linkedFns that have non-empty JIT hashes', async () => {
            // Setup: Pre-populate JIT function caches
            addAOTCaches(mockJitFnsCache, mockPureFnsCache);

            // Setup: Pre-populate router cache with linkedFn having non-empty JIT hashes
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                linkedFnWithJitFns: {
                    type: HandlerType.linkedFn,
                    id: 'linkedFnWithJitFns',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['value'],
                    paramsJitHash: MOCK_PARAMS_JIT_HASH,
                    returnJitHash: MOCK_RETURN_JIT_HASH,
                    pointer: ['linkedFnWithJitFns'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
                testRoute: {
                    type: HandlerType.route,
                    id: 'testRoute',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: [],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['testRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            };
            setPersistedMethods(mockCache);

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes with linkedFn
            const routes = {
                linkedFnWithJitFns: linkedFn((ctx: any, value: number): number => value * 2),
                testRoute: route((ctx: any): string => 'hello'),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the linkedFn was created with JIT functions
            const linkedFnExecutable = getLinkedFnExecutable('linkedFnWithJitFns');
            expect(linkedFnExecutable).toBeDefined();
            expect(linkedFnExecutable?.paramsJitFns).toBeDefined();
            expect(linkedFnExecutable?.returnJitFns).toBeDefined();
        });
    });

    describe('loadCompiledMethods', () => {
        it('should merge custom routes with existing cache', async () => {
            // Setup: Start with default routes
            setPersistedMethods({...defaultRoutesCache});

            // Add custom routes using loadCompiledMethods
            loadCompiledMethods({
                customRoute: {
                    type: HandlerType.route,
                    id: 'customRoute',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['value'],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['customRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            });

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes
            const routes = {
                customRoute: route((ctx: any, value: string): string => value),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the custom route was created
            const executable = getRouteExecutable('customRoute');
            expect(executable).toBeDefined();
            expect(executable?.paramNames).toEqual(['value']);
        });

        it('should not overwrite existing entries', async () => {
            // Setup: Start with a custom route
            setPersistedMethods({
                myRoute: {
                    type: HandlerType.route,
                    id: 'myRoute',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['original'],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['myRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
                ...defaultRoutesCache,
            });

            // Try to overwrite with loadCompiledMethods
            loadCompiledMethods({
                myRoute: {
                    type: HandlerType.route,
                    id: 'myRoute',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['overwritten'], // Different param name
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['myRoute'],
                    options: {runOnError: false, validateParams: true, validateReturn: false},
                },
            });

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes
            const routes = {
                myRoute: route((ctx: any, value: string): string => value),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the original entry was preserved
            const executable = getRouteExecutable('myRoute');
            expect(executable).toBeDefined();
            expect(executable?.paramNames).toEqual(['original']); // Original, not overwritten
        });
    });
});
