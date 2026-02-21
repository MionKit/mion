import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {mkdirSync, writeFileSync, rmSync, mkdtempSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';
import {computeSourceHash, resolveCacheDir, getOrGenerateAOTCaches, updateDiskCache} from './aotDiskCache.ts';
import {AOTCacheOptions} from './types.ts';

// Mock generateAOTCaches to avoid spawning real vite-node processes
vi.mock('./aotCacheGenerator.ts', () => ({
    generateAOTCaches: vi.fn(),
}));

import {generateAOTCaches} from './aotCacheGenerator.ts';

const mockedGenerateAOTCaches = vi.mocked(generateAOTCaches);

let tempDir: string;
let serverDir: string;
let cacheDir: string;

beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'mion-aot-test-'));
    serverDir = join(tempDir, 'server');
    cacheDir = join(tempDir, 'cache');
    mkdirSync(serverDir, {recursive: true});
    mkdirSync(cacheDir, {recursive: true});

    // Create some server source files
    writeFileSync(join(serverDir, 'init.ts'), 'export const init = () => {};');
    writeFileSync(join(serverDir, 'routes.ts'), 'export const routes = {};');
});

afterEach(() => {
    rmSync(tempDir, {recursive: true, force: true});
    vi.restoreAllMocks();
});

describe('computeSourceHash', () => {
    it('should produce a deterministic hash for the same directory', () => {
        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };
        const hash1 = computeSourceHash(options);
        const hash2 = computeSourceHash(options);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce a different hash when excludedFns differ', () => {
        const base: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };
        const withExclusions: AOTCacheOptions = {
            ...base,
            excludedFns: ['someFunction'],
        };
        const hash1 = computeSourceHash(base);
        const hash2 = computeSourceHash(withExclusions);
        expect(hash1).not.toBe(hash2);
    });

    it('should produce a different hash when excludedPureFns differ', () => {
        const base: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };
        const withExclusions: AOTCacheOptions = {
            ...base,
            excludedPureFns: ['pureFn1'],
        };
        const hash1 = computeSourceHash(base);
        const hash2 = computeSourceHash(withExclusions);
        expect(hash1).not.toBe(hash2);
    });

    it('should produce a different hash when a file is added', () => {
        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };
        const hash1 = computeSourceHash(options);
        writeFileSync(join(serverDir, 'newFile.ts'), 'export const x = 1;');
        const hash2 = computeSourceHash(options);
        expect(hash1).not.toBe(hash2);
    });

    it('should skip node_modules and test files', () => {
        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };
        const hash1 = computeSourceHash(options);

        // Adding test files and node_modules should not change the hash
        writeFileSync(join(serverDir, 'routes.spec.ts'), 'test file');
        mkdirSync(join(serverDir, 'node_modules', 'dep'), {recursive: true});
        writeFileSync(join(serverDir, 'node_modules', 'dep', 'index.ts'), 'dep');

        const hash2 = computeSourceHash(options);
        expect(hash1).toBe(hash2);
    });
});

describe('resolveCacheDir', () => {
    it('should return empty string when cache is false', () => {
        expect(resolveCacheDir({mode: 'client', cache: false})).toBe('');
    });

    it('should use custom path when cache is a string', () => {
        const result = resolveCacheDir({mode: 'client', cache: '/custom/path'});
        expect(result).toBe('/custom/path');
    });

    it('should use viteCacheDir when cache is true', () => {
        const result = resolveCacheDir({mode: 'client', cache: true}, '/vite/cache');
        expect(result).toBe('/vite/cache');
    });

    it('should fall back to node_modules/.vite when no viteCacheDir provided', () => {
        const result = resolveCacheDir({mode: 'client'});
        expect(result).toContain('node_modules/.vite');
    });
});

describe('getOrGenerateAOTCaches', () => {
    const mockData = {
        jitFnsCode: '{test: "jit"}',
        pureFnsCode: '{test: "pure"}',
        routerCacheCode: '{test: "router"}',
    };

    it('should generate fresh caches on first run and save to disk', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };

        const result = await getOrGenerateAOTCaches(options, cacheDir);
        expect(result).toEqual(mockData);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce();
    });

    it('should return cached data on second run without regenerating', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };

        // First call - generates and caches
        await getOrGenerateAOTCaches(options, cacheDir);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce();

        // Second call - should load from disk cache
        const result = await getOrGenerateAOTCaches(options, cacheDir);
        expect(result).toEqual(mockData);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce(); // Still only 1 call
    });

    it('should regenerate when MION_AOT_FORCE is set', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };

        // First call - generates and caches
        await getOrGenerateAOTCaches(options, cacheDir);

        // Set force flag
        process.env.MION_AOT_FORCE = 'true';
        try {
            await getOrGenerateAOTCaches(options, cacheDir);
            expect(mockedGenerateAOTCaches).toHaveBeenCalledTimes(2);
        } finally {
            delete process.env.MION_AOT_FORCE;
        }
    });

    it('should regenerate when source files change', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };

        // First call - generates and caches
        await getOrGenerateAOTCaches(options, cacheDir);

        // Modify a source file (need small delay to ensure mtime changes)
        await new Promise((r) => setTimeout(r, 50));
        writeFileSync(join(serverDir, 'routes.ts'), 'export const routes = {updated: true};');

        // Second call - should regenerate due to hash mismatch
        await getOrGenerateAOTCaches(options, cacheDir);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledTimes(2);
    });

    it('should skip caching when cacheDir is empty', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
            cache: false,
        };

        // First call
        await getOrGenerateAOTCaches(options, '');
        // Second call - should regenerate since caching is disabled
        await getOrGenerateAOTCaches(options, '');
        expect(mockedGenerateAOTCaches).toHaveBeenCalledTimes(2);
    });
});

describe('updateDiskCache', () => {
    const mockData = {
        jitFnsCode: '{test: "jit"}',
        pureFnsCode: '{test: "pure"}',
        routerCacheCode: '{test: "router"}',
    };

    it('should write cache that can be read back by getOrGenerateAOTCaches', async () => {
        mockedGenerateAOTCaches.mockResolvedValue(mockData);

        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
        };

        // Write cache via updateDiskCache (simulates HMR)
        updateDiskCache(options, mockData, cacheDir);

        // Should load from disk cache without regenerating
        const result = await getOrGenerateAOTCaches(options, cacheDir);
        expect(result).toEqual(mockData);
        expect(mockedGenerateAOTCaches).not.toHaveBeenCalled();
    });

    it('should be a no-op when cache is disabled', () => {
        const options: AOTCacheOptions = {
            mode: 'client',
            startServerScript: join(serverDir, 'init.ts'),
            cache: false,
        };
        // Should not throw
        updateDiskCache(options, mockData, '');
    });
});
