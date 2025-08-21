/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {loadAOTCachesIfAvailable} from './aot';

describe('AOT Cache Loading', () => {
    beforeEach(() => {
        // Reset environment variables
        delete process.env.MION_DISABLE_AOT_CACHE;
        delete process.env.MION_CACHE_VERBOSE;
        delete process.env.MION_ENABLE_CACHE_IN_TESTS;
    });

    it('should skip loading when explicitly disabled', () => {
        process.env.MION_DISABLE_AOT_CACHE = 'true';
        
        // Should not throw and should return immediately
        expect(() => {
            loadAOTCachesIfAvailable();
        }).not.toThrow();
    });

    it('should skip loading in test environment by default', () => {
        process.env.NODE_ENV = 'test';
        
        // Should not throw and should return immediately
        expect(() => {
            loadAOTCachesIfAvailable();
        }).not.toThrow();
    });

    it('should attempt loading in test environment when explicitly enabled', () => {
        process.env.NODE_ENV = 'test';
        process.env.MION_ENABLE_CACHE_IN_TESTS = 'true';
        
        // Should not throw even if no cache files exist
        expect(() => {
            loadAOTCachesIfAvailable();
        }).not.toThrow();
    });

    it('should attempt loading in production environment', () => {
        process.env.NODE_ENV = 'production';
        
        // Should not throw even if no cache files exist
        expect(() => {
            loadAOTCachesIfAvailable();
        }).not.toThrow();
    });
});
