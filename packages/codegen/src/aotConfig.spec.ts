/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {
    getAOTConfig,
    shouldLoadAOTCaches,
    shouldUseVerboseLogging,
    shouldCompile,
    getCacheFileExtension,
    generateCacheFileName,
    getCacheFileNames,
    getCacheDirPaths,
    DEFAULT_AOT_CONFIG,
} from './aotConfig';

describe('AOT Configuration', () => {
    beforeEach(() => {
        // Reset environment variables
        delete process.env.MION_DISABLE_AOT_CACHE;
        delete process.env.MION_CACHE_VERBOSE;
        delete process.env.MION_ENABLE_CACHE_IN_TESTS;
        delete process.env.MION_COMPILE;
        delete process.env.NODE_ENV;
    });

    describe('getAOTConfig', () => {
        it('should return default configuration', () => {
            const config = getAOTConfig();
            expect(config).toEqual(DEFAULT_AOT_CONFIG);
        });
    });

    describe('shouldLoadAOTCaches', () => {
        it('should return false when explicitly disabled', () => {
            process.env.MION_DISABLE_AOT_CACHE = 'true';
            expect(shouldLoadAOTCaches()).toBe(false);
        });

        it('should return false in test environment by default', () => {
            process.env.NODE_ENV = 'test';
            expect(shouldLoadAOTCaches()).toBe(false);
        });

        it('should return true in test environment when explicitly enabled', () => {
            process.env.NODE_ENV = 'test';
            process.env.MION_ENABLE_CACHE_IN_TESTS = 'true';
            expect(shouldLoadAOTCaches()).toBe(true);
        });

        it('should return true in production environment', () => {
            process.env.NODE_ENV = 'production';
            expect(shouldLoadAOTCaches()).toBe(true);
        });
    });

    describe('shouldUseVerboseLogging', () => {
        it('should return false by default', () => {
            expect(shouldUseVerboseLogging()).toBe(false);
        });

        it('should return true when enabled', () => {
            process.env.MION_CACHE_VERBOSE = 'true';
            expect(shouldUseVerboseLogging()).toBe(true);
        });
    });

    describe('shouldCompile', () => {
        it('should return false by default', () => {
            expect(shouldCompile()).toBe(false);
        });

        it('should return true when enabled', () => {
            process.env.MION_COMPILE = 'true';
            expect(shouldCompile()).toBe(true);
        });
    });

    describe('getCacheFileExtension', () => {
        it('should return .mjs for ESM', () => {
            expect(getCacheFileExtension('esm')).toBe('.mjs');
        });

        it('should return .js for CJS', () => {
            expect(getCacheFileExtension('cjs')).toBe('.js');
        });
    });

    describe('generateCacheFileName', () => {
        it('should generate ESM cache file names by default', () => {
            expect(generateCacheFileName('router')).toBe('router.cache.mjs');
            expect(generateCacheFileName('jit')).toBe('jit.cache.mjs');
            expect(generateCacheFileName('pure')).toBe('pure.cache.mjs');
        });

        it('should generate CJS cache file names', () => {
            expect(generateCacheFileName('router', 'cjs')).toBe('router.cache.js');
            expect(generateCacheFileName('jit', 'cjs')).toBe('jit.cache.js');
            expect(generateCacheFileName('pure', 'cjs')).toBe('pure.cache.js');
        });
    });

    describe('getCacheFileNames', () => {
        it('should return all possible router cache file names', () => {
            const names = getCacheFileNames('router');
            expect(names).toContain('router.cache.js');
            expect(names).toContain('router.cache.mjs');
            expect(names).toContain('routes.cache.js');
            expect(names).toContain('routes.cache.mjs');
        });

        it('should return all possible JIT cache file names', () => {
            const names = getCacheFileNames('jit');
            expect(names).toContain('jit.cache.js');
            expect(names).toContain('jit.cache.mjs');
            expect(names).toContain('jitFunctions.cache.js');
            expect(names).toContain('jitFunctions.cache.mjs');
        });

        it('should return all possible pure cache file names', () => {
            const names = getCacheFileNames('pure');
            expect(names).toContain('pure.cache.js');
            expect(names).toContain('pure.cache.mjs');
            expect(names).toContain('pureFunctions.cache.js');
            expect(names).toContain('pureFunctions.cache.mjs');
        });
    });

    describe('getCacheDirPaths', () => {
        it('should return cache directory paths relative to app root', () => {
            const paths = getCacheDirPaths('/app');
            expect(paths).toContain('/app/dist/.mion-cache');
            expect(paths).toContain('/app/.mion-cache');
            expect(paths).toContain('/app/build/.mion-cache');
        });
    });
});
