import {describe, it, expect, beforeEach, afterEach, vi} from 'vitest';
import {mkdirSync, writeFileSync, rmSync, mkdtempSync} from 'fs';
import {join} from 'path';
import {tmpdir} from 'os';
import {computeSourceHash, resolveCacheDir, getOrGenerateAOTCaches, updateDiskCache} from './aotDiskCache.ts';
import {MionServerConfig, AOTCacheOptions} from './types.ts';

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
    vi.clearAllMocks();
});

function makeServerConfig(overrides?: Partial<MionServerConfig>): MionServerConfig {
    return {
        startServerScript: join(serverDir, 'init.ts'),
        mode: 'onlyAOT',
        ...overrides,
    };
}

describe('computeSourceHash', () => {
    it('should produce a deterministic hash for the same directory', () => {
        const serverConfig = makeServerConfig();
        const hash1 = computeSourceHash(serverConfig);
        const hash2 = computeSourceHash(serverConfig);
        expect(hash1).toBe(hash2);
        expect(hash1).toHaveLength(64); // SHA-256 hex
    });

    it('should produce a different hash when excludedFns differ', () => {
        const serverConfig = makeServerConfig();
        const hash1 = computeSourceHash(serverConfig);
        const hash2 = computeSourceHash(serverConfig, {excludedFns: ['someFunction']});
        expect(hash1).not.toBe(hash2);
    });

    it('should produce a different hash when excludedPureFns differ', () => {
        const serverConfig = makeServerConfig();
        const hash1 = computeSourceHash(serverConfig);
        const hash2 = computeSourceHash(serverConfig, {excludedPureFns: ['pureFn1']});
        expect(hash1).not.toBe(hash2);
    });

    it('should produce a different hash when a file is added', () => {
        const serverConfig = makeServerConfig();
        const hash1 = computeSourceHash(serverConfig);
        writeFileSync(join(serverDir, 'newFile.ts'), 'export const x = 1;');
        const hash2 = computeSourceHash(serverConfig);
        expect(hash1).not.toBe(hash2);
    });

    it('should skip node_modules and test files', () => {
        const serverConfig = makeServerConfig();
        const hash1 = computeSourceHash(serverConfig);

        // Adding test files and node_modules should not change the hash
        writeFileSync(join(serverDir, 'routes.spec.ts'), 'test file');
        mkdirSync(join(serverDir, 'node_modules', 'dep'), {recursive: true});
        writeFileSync(join(serverDir, 'node_modules', 'dep', 'index.ts'), 'dep');

        const hash2 = computeSourceHash(serverConfig);
        expect(hash1).toBe(hash2);
    });
});

describe('resolveCacheDir', () => {
    it('should return empty string when cache is false', () => {
        expect(resolveCacheDir({cache: false})).toBe('');
    });

    it('should use custom path when cache is a string', () => {
        const result = resolveCacheDir({cache: '/custom/path'});
        expect(result).toBe('/custom/path');
    });

    it('should use viteCacheDir when cache is true', () => {
        const result = resolveCacheDir({cache: true}, '/vite/cache');
        expect(result).toBe('/vite/cache');
    });

    it('should fall back to node_modules/.vite when no viteCacheDir provided', () => {
        const result = resolveCacheDir({});
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
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();
        const result = await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
        expect(result.data).toEqual(mockData);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce();
    });

    it('should return cached data on second run without regenerating', async () => {
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();

        // First call - generates and caches
        await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce();

        // Second call - should load from disk cache
        const result = await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
        expect(result.data).toEqual(mockData);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledOnce(); // Still only 1 call
    });

    it('should regenerate when MION_AOT_FORCE is set', async () => {
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();

        // First call - generates and caches
        await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);

        // Set force flag
        process.env.MION_AOT_FORCE = 'true';
        try {
            await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
            expect(mockedGenerateAOTCaches).toHaveBeenCalledTimes(2);
        } finally {
            delete process.env.MION_AOT_FORCE;
        }
    });

    it('should regenerate when source files change', async () => {
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();

        // First call - generates and caches
        await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);

        // Modify a source file (need small delay to ensure mtime changes)
        await new Promise((r) => setTimeout(r, 50));
        writeFileSync(join(serverDir, 'routes.ts'), 'export const routes = {updated: true};');

        // Second call - should regenerate due to hash mismatch
        await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
        expect(mockedGenerateAOTCaches).toHaveBeenCalledTimes(2);
    });

    it('should skip caching when cacheDir is empty', async () => {
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();
        const aotOptions: AOTCacheOptions = {cache: false};

        // First call
        await getOrGenerateAOTCaches(serverConfig, aotOptions, '');
        // Second call - should regenerate since caching is disabled
        await getOrGenerateAOTCaches(serverConfig, aotOptions, '');
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
        mockedGenerateAOTCaches.mockResolvedValue({data: mockData});

        const serverConfig = makeServerConfig();

        // Write cache via updateDiskCache (simulates HMR)
        updateDiskCache(serverConfig, undefined, mockData, cacheDir);

        // Should load from disk cache without regenerating
        const result = await getOrGenerateAOTCaches(serverConfig, undefined, cacheDir);
        expect(result.data).toEqual(mockData);
        expect(mockedGenerateAOTCaches).not.toHaveBeenCalled();
    });

    it('should be a no-op when cache is disabled', () => {
        const serverConfig = makeServerConfig();
        const aotOptions: AOTCacheOptions = {cache: false};
        // Should not throw
        updateDiskCache(serverConfig, aotOptions, mockData, '');
    });
});
