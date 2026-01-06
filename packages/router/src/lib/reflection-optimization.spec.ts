/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {initRouter, registerRoutes, resetRouter, getRouteExecutable, getHookExecutable} from '../router';
import {route, hook} from './handlers';
import {getHandlerReflection, nullJitFns} from './reflection';
import {DEFAULT_ROUTE_OPTIONS} from '../constants';
import {EMPTY_HASH} from '@mionkit/core';
import {getSerializableMethod} from './remoteMethods';
import {getPersistedMethod, setPersistedMethods} from './methodsCache';

describe('JIT Function Generation Optimization', () => {
    beforeEach(() => {
        resetRouter();
        initRouter();
    });

    afterEach(() => {
        resetRouter();
    });

    describe('No params optimization', () => {
        it('should skip JIT generation for handler with no params', () => {
            const handler = (ctx): void => {
                // Hook with no params
            };

            const reflection = getHandlerReflection(handler, 'testHook', DEFAULT_ROUTE_OPTIONS);

            expect(reflection.paramNames).toEqual([]);
            expect(reflection.paramsJitFns).toBe(nullJitFns);
            expect(reflection.paramsJitHash).toBe(EMPTY_HASH);
        });

        it('should generate JIT functions for handler with params', () => {
            const handler = (ctx, name: string): void => {
                // Hook with params
            };

            const reflection = getHandlerReflection(handler, 'testHook', DEFAULT_ROUTE_OPTIONS);

            expect(reflection.paramNames).toEqual(['name']);
            expect(reflection.paramsJitFns).not.toBe(nullJitFns);
            expect(reflection.paramsJitHash).not.toBe(EMPTY_HASH);
            expect(reflection.paramsJitHash).toBeTruthy();
        });

        it('should work end-to-end with registered hook with no params', () => {
            const routes = {
                noParamsHook: hook((ctx): void => {
                    // No params
                }),
            };

            registerRoutes(routes);
            const executable = getHookExecutable('noParamsHook');

            expect(executable).toBeDefined();
            expect(executable!.paramNames).toEqual([]);
            expect(executable!.paramsJitFns).toBe(nullJitFns);
            expect(executable!.paramsJitHash).toBe(EMPTY_HASH);
        });
    });

    describe('Void return optimization', () => {
        it('should skip JIT generation for handler with void return', () => {
            const handler = (ctx, name: string): void => {
                // Void return
            };

            const reflection = getHandlerReflection(handler, 'testHook', DEFAULT_ROUTE_OPTIONS);

            expect(reflection.hasReturnData).toBe(false);
            expect(reflection.returnJitFns).toBe(nullJitFns);
            expect(reflection.returnJitHash).toBe(EMPTY_HASH);
        });

        it('should generate JIT functions for handler with return data', () => {
            const handler = (ctx, name: string): string => {
                return `Hello ${name}`;
            };

            const reflection = getHandlerReflection(handler, 'testRoute', DEFAULT_ROUTE_OPTIONS);

            expect(reflection.hasReturnData).toBe(true);
            expect(reflection.returnJitFns).not.toBe(nullJitFns);
            expect(reflection.returnJitHash).not.toBe(EMPTY_HASH);
            expect(reflection.returnJitHash).toBeTruthy();
        });

        it('should work end-to-end with registered route with void return', () => {
            const routes = {
                voidReturn: route((ctx, name: string): void => {
                    // Void return
                }),
            };

            registerRoutes(routes);
            const executable = getRouteExecutable('voidReturn');

            expect(executable).toBeDefined();
            expect(executable!.hasReturnData).toBe(false);
            expect(executable!.returnJitFns).toBe(nullJitFns);
            expect(executable!.returnJitHash).toBe(EMPTY_HASH);
        });
    });

    describe('Combined optimization', () => {
        it('should skip both params and return JIT for hook with no params and void return', () => {
            const handler = (ctx): void => {
                // No params, void return
            };

            const reflection = getHandlerReflection(handler, 'testHook', DEFAULT_ROUTE_OPTIONS);

            // No params
            expect(reflection.paramNames).toEqual([]);
            expect(reflection.paramsJitFns).toBe(nullJitFns);
            expect(reflection.paramsJitHash).toBe(EMPTY_HASH);

            // Void return
            expect(reflection.hasReturnData).toBe(false);
            expect(reflection.returnJitFns).toBe(nullJitFns);
            expect(reflection.returnJitHash).toBe(EMPTY_HASH);
        });

        it('should work end-to-end with common hook pattern (no params, void return)', () => {
            const routes = {
                authHook: hook((ctx): void => {
                    // Common pattern: modify context, no params, no return
                    (ctx as any).user = {id: '123'};
                }),
            };

            registerRoutes(routes);
            const executable = getHookExecutable('authHook');

            expect(executable).toBeDefined();
            expect(executable!.paramNames).toEqual([]);
            expect(executable!.paramsJitFns).toBe(nullJitFns);
            expect(executable!.paramsJitHash).toBe(EMPTY_HASH);
            expect(executable!.hasReturnData).toBe(false);
            expect(executable!.returnJitFns).toBe(nullJitFns);
            expect(executable!.returnJitHash).toBe(EMPTY_HASH);
        });
    });

    describe('AOT cache serialization and restoration', () => {
        it('should serialize handler with no params and void return to AOT cache', () => {
            const routes = {
                simpleHook: hook((ctx): void => {
                    // No params, void return
                }),
            };

            registerRoutes(routes);
            const executable = getHookExecutable('simpleHook');
            const serialized = getSerializableMethod(executable!);

            expect(serialized.paramsJitHash).toBe(EMPTY_HASH);
            expect(serialized.returnJitHash).toBe(EMPTY_HASH);
            expect(serialized.paramNames).toEqual([]);
            expect(serialized.hasReturnData).toBe(false);
        });

        it('should restore handler with no params and void return from AOT cache', () => {
            const handler = (ctx): void => {
                // No params, void return
            };

            // Simulate AOT cache data
            const aotCacheData = {
                id: 'testHook',
                type: 'hook' as const,
                paramsJitHash: EMPTY_HASH,
                returnJitHash: EMPTY_HASH,
                paramNames: [],
                hasReturnData: false,
            };

            // Simulate loading from AOT cache
            setPersistedMethods({testHook: aotCacheData as any});

            // Restore the method
            const restored = getPersistedMethod('testHook', handler);

            expect(restored).toBeDefined();
            expect(restored!.paramNames).toEqual([]);
            expect(restored!.paramsJitFns).toBe(nullJitFns);
            expect(restored!.paramsJitHash).toBe(EMPTY_HASH);
            expect(restored!.hasReturnData).toBe(false);
            expect(restored!.returnJitFns).toBe(nullJitFns);
            expect(restored!.returnJitHash).toBe(EMPTY_HASH);
        });

        it('should handle mixed scenarios in AOT cache', () => {
            const routes = {
                noParamsVoidReturn: hook((ctx): void => {}),
                withParamsVoidReturn: hook((ctx, name: string): void => {}),
                noParamsWithReturn: route((ctx): string => 'hello'),
                withParamsWithReturn: route((ctx, name: string): string => `hello ${name}`),
            };

            registerRoutes(routes);

            // Check no params, void return
            const hook1 = getHookExecutable('noParamsVoidReturn');
            expect(hook1!.paramsJitHash).toBe(EMPTY_HASH);
            expect(hook1!.returnJitHash).toBe(EMPTY_HASH);

            // Check with params, void return
            const hook2 = getHookExecutable('withParamsVoidReturn');
            expect(hook2!.paramsJitHash).not.toBe(EMPTY_HASH);
            expect(hook2!.returnJitHash).toBe(EMPTY_HASH);

            // Check no params, with return
            const route1 = getRouteExecutable('noParamsWithReturn');
            expect(route1!.paramsJitHash).toBe(EMPTY_HASH);
            expect(route1!.returnJitHash).not.toBe(EMPTY_HASH);

            // Check with params, with return
            const route2 = getRouteExecutable('withParamsWithReturn');
            expect(route2!.paramsJitHash).not.toBe(EMPTY_HASH);
            expect(route2!.returnJitHash).not.toBe(EMPTY_HASH);
        });
    });
});
