/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    AOTCachesNotLoadedError,
    AOTFunctionMissingError,
    AOTRouterCacheMissingError,
    isAOTCacheLoaded,
    getJitCacheSize,
    getPureCacheSize,
    hasJitFunctionInCache,
    hasPureFunctionInCache,
    resetJitFnCaches,
    addAOTCaches,
} from '@mionkit/core';
import {initRouter, resetRouter, registerRoutes} from '../router';
import {setPersistedMethods, resetPersistedMethods, getAOTMode, setAOTMode} from './methodsCache';
import type {AOTMode} from '../types/general';

describe('AOT Lazy Loading', () => {
    beforeEach(() => {
        resetRouter();
        resetJitFnCaches();
    });

    describe('AOT Error Types', () => {
        it('should create AOTCachesNotLoadedError with correct message', () => {
            const error = new AOTCachesNotLoadedError();
            expect(error.name).toBe('AOTCachesNotLoadedError');
            expect(error.type).toBe('aot-caches-not-loaded');
            expect(error['mion@isΣrrθr']).toBe(true);
            expect(error.message).toContain('AOT caches not loaded');
            expect(error.message).toContain('strict mode');
        });

        it('should create AOTFunctionMissingError with correct message and properties', () => {
            const error = new AOTFunctionMissingError('myRoute', 'abc123');
            expect(error.name).toBe('AOTFunctionMissingError');
            expect(error.type).toBe('aot-function-missing');
            expect(error['mion@isΣrrθr']).toBe(true);
            expect(error.routeId).toBe('myRoute');
            expect(error.functionHash).toBe('abc123');
            expect(error.message).toContain('myRoute');
            expect(error.message).toContain('abc123');
        });

        it('should create AOTRouterCacheMissingError with correct message and properties', () => {
            const error = new AOTRouterCacheMissingError('myRoute');
            expect(error.name).toBe('AOTRouterCacheMissingError');
            expect(error.type).toBe('aot-router-cache-missing');
            expect(error['mion@isΣrrθr']).toBe(true);
            expect(error.routeId).toBe('myRoute');
            expect(error.message).toContain('myRoute');
            expect(error.message).toContain('not found in AOT router cache');
        });
    });

    describe('AOT Cache State Functions', () => {
        it('should return false for isAOTCacheLoaded when no caches loaded', () => {
            expect(isAOTCacheLoaded()).toBe(false);
        });

        it('should return true for isAOTCacheLoaded after addAOTCaches is called', () => {
            addAOTCaches({}, {});
            expect(isAOTCacheLoaded()).toBe(true);
        });

        it('should return 0 for getJitCacheSize when cache is empty', () => {
            expect(getJitCacheSize()).toBe(0);
        });

        it('should return 0 for getPureCacheSize when cache is empty', () => {
            expect(getPureCacheSize()).toBe(0);
        });

        it('should return false for hasJitFunctionInCache when function does not exist', () => {
            expect(hasJitFunctionInCache('nonexistent')).toBe(false);
        });

        it('should return false for hasPureFunctionInCache when function does not exist', () => {
            expect(hasPureFunctionInCache('nonexistent')).toBe(false);
        });
    });

    describe('AOT Mode Configuration', () => {
        it('should default to auto mode', () => {
            initRouter();
            expect(getAOTMode()).toBe('auto');
        });

        it('should allow setting aotMode to disabled', () => {
            initRouter({aotMode: 'disabled'});
            expect(getAOTMode()).toBe('disabled');
        });

        it('should throw AOTCachesNotLoadedError when strict mode is enabled without caches', () => {
            expect(() => {
                initRouter({aotMode: 'strict'});
            }).toThrow(AOTCachesNotLoadedError);
        });

        it('should not throw when strict mode is enabled with caches loaded', () => {
            addAOTCaches({}, {});
            expect(() => {
                initRouter({aotMode: 'strict'});
            }).not.toThrow();
        });

        it('should not throw in auto mode without caches', () => {
            expect(() => {
                initRouter({aotMode: 'auto'});
            }).not.toThrow();
        });

        it('should not throw in disabled mode without caches', () => {
            expect(() => {
                initRouter({aotMode: 'disabled'});
            }).not.toThrow();
        });
    });

    describe('AOT Mode State Management', () => {
        it('should reset AOT mode when resetPersistedMethods is called', () => {
            setAOTMode('strict');
            expect(getAOTMode()).toBe('strict');
            resetPersistedMethods();
            expect(getAOTMode()).toBe('auto');
        });

        it('should set AOT mode correctly', () => {
            const modes: AOTMode[] = ['auto', 'strict', 'disabled'];
            for (const mode of modes) {
                setAOTMode(mode);
                expect(getAOTMode()).toBe(mode);
            }
        });
    });
});
