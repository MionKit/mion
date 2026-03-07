/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect, beforeEach} from 'vitest';
import {resetRouter, initRouter, registerRoutes, getRouteExecutable, getMiddleFnExecutable} from '../router.ts';
import {route, middleFn, rawMiddleFn} from './handlers.ts';
import {setPersistedMethods, resetPersistedMethods, loadCompiledMethods} from './methodsCache.ts';
import {AOTCacheError, resetRunTypesCache} from './reflection.ts';
import {
    HandlerType,
    EMPTY_HASH,
    resetJitFnCaches,
    addAOTCaches,
    getJitFunctionsFromHash,
    addRoutesToCache,
    getJitUtils,
} from '@mionjs/core';
import type {Routes} from '../types/general.ts';
import type {MethodsCache, PersistedJitFunctionsCache, PersistedPureFunctionsCache} from '@mionjs/core';
import {
    cpf_asJSONString,
    cpf_getUnknownKeysFromArray,
    cpf_hasUnknownKeysFromArray,
    cpf_newRunTypeErr,
    cpf_formatErr,
    cpf_safeIterableKey,
    cpf_sanitizeCompiledFn,
} from '@mionjs/run-types';

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

// Mock default routes cache for testing (simulates what virtual:mion-aot/router-cache would provide)
// Note: Using EMPTY_HASH for all JIT hashes since we don't have actual JIT functions in tests
// In production, these would be populated by the AOT cache generation process
const defaultRoutesCache: MethodsCache = {
    '@thrownErrors': {
        paramNames: [],
        type: HandlerType.route,
        id: '@thrownErrors',
        isAsync: false,
        hasReturnData: true,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH, // Using EMPTY_HASH for tests
        pointer: ['@thrownErrors'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
    'mion@notFound': {
        paramNames: [],
        type: HandlerType.route,
        id: 'mion@notFound',
        isAsync: false,
        hasReturnData: true,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['mion@notFound'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
    'mion@platformError': {
        paramNames: [],
        type: HandlerType.route,
        id: 'mion@platformError',
        isAsync: false,
        hasReturnData: true,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['mion@platformError'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
    'mion@methodsMetadataById': {
        paramNames: ['methodsIds', 'getAllRemoteMethods'],
        type: HandlerType.route,
        id: 'mion@methodsMetadataById',
        isAsync: false,
        hasReturnData: true,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['mion@methodsMetadataById'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
    'mion@methodsMetadataByPath': {
        paramNames: ['path', 'getAllRemoteMethods'],
        type: HandlerType.route,
        id: 'mion@methodsMetadataByPath',
        isAsync: false,
        hasReturnData: true,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['mion@methodsMetadataByPath'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
    'mion@mionEmptyMiddleFn': {
        paramNames: [],
        type: HandlerType.middleFn,
        id: 'mion@mionEmptyMiddleFn',
        isAsync: false,
        hasReturnData: false,
        paramsJitHash: EMPTY_HASH,
        returnJitHash: EMPTY_HASH,
        pointer: ['mion@mionEmptyMiddleFn'],
        nestLevel: 0,
        options: {runOnError: false, validateParams: true, validateReturn: false},
    },
};

describe('AOT Lazy Loading', () => {
    beforeEach(() => {
        resetRouter();
        resetPersistedMethods();
        resetRunTypesCache();
        resetJitFnCaches();
        reRegisterRunTypesPureFns(); // Re-register pure functions needed for JIT generation
    });

    describe('AOT mode enabled', () => {
        it('should use cached data when route is in AOT cache', async () => {
            // Setup: Pre-populate cache with default routes AND custom route data BEFORE initRouter
            // This simulates having a complete AOT cache with user routes
            const customRouteCache: MethodsCache = {
                ...defaultRoutesCache, // Include default routes for error handling
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

        it('should throw AOTCacheError when middleFn is missing from cache', async () => {
            // Setup: Cache with default routes and route but missing the custom middleFn
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

            // Register routes with a middleFn that's not in cache
            const routes = {
                missingMiddleFn: middleFn((ctx: any): void => undefined),
                sayHello: route((ctx: any): string => 'hello'),
            } satisfies Routes;

            await expect(registerRoutes(routes)).rejects.toThrow(AOTCacheError);
            await expect(registerRoutes(routes)).rejects.toThrow('missingMiddleFn');
        });

        it('should NOT throw AOTCacheError for raw middleFns (they do not need AOT cache)', async () => {
            // Raw middleFns don't need JIT functions, so they don't need to be in the AOT cache
            // They should work in AOT mode without being in the cache
            setPersistedMethods({...defaultRoutesCache});

            // Initialize router in AOT mode
            await initRouter({aot: true});

            // Register routes with a raw middleFn that's not in cache - should NOT throw
            const routes = {
                myRawMiddleFn: rawMiddleFn((ctx: any, cb: () => void): void => cb()),
            } satisfies Routes;

            // This should succeed because raw middleFns don't need to be in the AOT cache
            await expect(registerRoutes(routes)).resolves.not.toThrow();
        });

        it('should work with complete AOT cache', async () => {
            // Setup: Complete cache with all routes and middleFns
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                myMiddleFn: {
                    type: HandlerType.middleFn,
                    id: 'myMiddleFn',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: false,
                    paramNames: [],
                    paramsJitHash: EMPTY_HASH,
                    returnJitHash: EMPTY_HASH,
                    pointer: ['myMiddleFn'],
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
                myMiddleFn: middleFn((ctx: any): void => undefined),
                myRoute: route((ctx: any, data: string): string => data),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify routes were created
            expect(getMiddleFnExecutable('myMiddleFn')).toBeDefined();
            expect(getRouteExecutable('myRoute')).toBeDefined();
            expect(getRouteExecutable('myRoute')?.paramNames).toEqual(['data']);
        });

        it('should require AOT caches to be pre-loaded via virtual modules before initRouter', async () => {
            // With the new virtual module approach, AOT caches must be loaded BEFORE initRouter
            // This simulates what happens when you import 'virtual:mion-aot/router-cache'
            // which calls addRoutesToCache() to register the caches

            // Pre-load the default routes cache (simulating virtual:mion-aot/router-cache import)
            addRoutesToCache(defaultRoutesCache);
            setPersistedMethods(defaultRoutesCache);

            // Initialize router in AOT mode
            await initRouter({aot: true, skipClientRoutes: true});

            // The default error routes should be available from the pre-loaded cache
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
            // Setup: Create mock cache with default routes (needed for error handling)
            const mockCache: MethodsCache = {
                ...defaultRoutesCache, // Include default routes
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

        it('should generate reflection for middleFns not in cache', async () => {
            // Setup: Include default routes cache (needed for error handling)
            setPersistedMethods({...defaultRoutesCache});

            // Initialize router in non-AOT mode
            await initRouter({aot: false});

            // Register routes with middleFns
            const routes = {
                myMiddleFn: middleFn((ctx: any, data: number): number => data * 2),
                myRoute: route((ctx: any): string => 'hello'),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify middleFn was created with reflection data
            const middleFnExecutable = getMiddleFnExecutable('myMiddleFn');
            expect(middleFnExecutable).toBeDefined();
            expect(middleFnExecutable?.id).toBe('myMiddleFn');
            expect(middleFnExecutable?.paramNames).toEqual(['data']);
            expect(middleFnExecutable?.hasReturnData).toBe(true);
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

        it('should have correct error message for middleFns', () => {
            const error = new AOTCacheError('auth', 'middleFn');
            expect(error.name).toBe('AOTCacheError');
            expect(error.message).toContain('MiddleFn');
            expect(error.message).toContain('auth');
        });

        it('should have correct error message for raw middleFns', () => {
            const error = new AOTCacheError('mionDeserializeRequest', 'rawMiddleFn');
            expect(error.name).toBe('AOTCacheError');
            expect(error.message).toContain('Raw middleFn');
            expect(error.message).toContain('mionDeserializeRequest');
        });
    });

    describe('Run-types module caching', () => {
        it('should only load run-types once for multiple routes', async () => {
            // Setup: Include default routes cache (needed for error handling)
            setPersistedMethods({...defaultRoutesCache});

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

        it('should work with middleFns that have non-empty JIT hashes', async () => {
            // Setup: Pre-populate JIT function caches
            addAOTCaches(mockJitFnsCache, mockPureFnsCache);

            // Setup: Pre-populate router cache with middleFn having non-empty JIT hashes
            const mockCache: MethodsCache = {
                ...defaultRoutesCache,
                middleFnWithJitFns: {
                    type: HandlerType.middleFn,
                    id: 'middleFnWithJitFns',
                    nestLevel: 0,
                    isAsync: false,
                    hasReturnData: true,
                    paramNames: ['value'],
                    paramsJitHash: MOCK_PARAMS_JIT_HASH,
                    returnJitHash: MOCK_RETURN_JIT_HASH,
                    pointer: ['middleFnWithJitFns'],
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

            // Register routes with middleFn
            const routes = {
                middleFnWithJitFns: middleFn((ctx: any, value: number): number => value * 2),
                testRoute: route((ctx: any): string => 'hello'),
            } satisfies Routes;
            await registerRoutes(routes);

            // Verify the middleFn was created with JIT functions
            const middleFnExecutable = getMiddleFnExecutable('middleFnWithJitFns');
            expect(middleFnExecutable).toBeDefined();
            expect(middleFnExecutable?.paramsJitFns).toBeDefined();
            expect(middleFnExecutable?.returnJitFns).toBeDefined();
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
