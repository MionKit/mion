/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {shouldUseVerboseLogging, getCacheFileExtension, generateCacheFileName, DEFAULT_AOT_CONFIG} from './aotConfig';

describe('AOT Configuration', () => {
    beforeEach(() => {
        // Reset environment variables
        delete process.env.MION_CACHE_VERBOSE;
        delete process.env.MION_COMPILE;
    });

    describe('DEFAULT_AOT_CONFIG', () => {
        it('should have expected structure', () => {
            expect(DEFAULT_AOT_CONFIG).toBeDefined();
            expect(DEFAULT_AOT_CONFIG.defaultBaseDir).toBe('./dist');
            expect(DEFAULT_AOT_CONFIG.cacheDirectoryName).toBe('.mion-cache');
            expect(DEFAULT_AOT_CONFIG.defaultOutputDir).toBe('./dist/.mion-cache');
            expect(DEFAULT_AOT_CONFIG.defaultModuleFormat).toBe('esm');
            expect(DEFAULT_AOT_CONFIG.defaultVerbose).toBe(false);
            expect(DEFAULT_AOT_CONFIG.envVars.verbose).toBe('MION_CACHE_VERBOSE');
            expect(DEFAULT_AOT_CONFIG.envVars.compile).toBe('MION_COMPILE');
            // Should not have the removed properties
            expect(DEFAULT_AOT_CONFIG).not.toHaveProperty('cacheDirs');
            expect(DEFAULT_AOT_CONFIG).not.toHaveProperty('cacheFiles');
            expect(DEFAULT_AOT_CONFIG.envVars).not.toHaveProperty('disable');
            expect(DEFAULT_AOT_CONFIG.envVars).not.toHaveProperty('enableInTests');
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
});
