import {describe, it, expect, vi, afterEach} from 'vitest';
import {mionVitePlugin} from './mionVitePlugin.ts';
import {AOT_CACHES_SHIM, VIRTUAL_AOT_CACHES, resolveVirtualId} from './constants.ts';

// Mock heavy dependencies to avoid spawning processes
vi.mock('./aotCacheGenerator.ts', () => ({
    generateAOTCaches: vi.fn(),
    loadSSRRouterAndGenerateAOTCaches: vi.fn(),
    killPersistentChild: vi.fn(),
    logAOTCaches: vi.fn(),
    waitForServer: vi.fn(),
    generateJitFnsModule: vi.fn(),
    generatePureFnsModule: vi.fn(),
    generateRouterCacheModule: vi.fn(),
    generateCombinedCachesModule: vi.fn(),
    generateNoopModule: vi.fn(),
    generateNoopCombinedModule: vi.fn(),
    buildAOTVirtualModuleMaps: vi.fn(() => ({aotVirtualModules: new Set(), aotResolvedIds: new Map()})),
}));

vi.mock('./aotDiskCache.ts', () => ({
    getOrGenerateAOTCaches: vi.fn(),
    updateDiskCache: vi.fn(),
    resolveCacheDir: vi.fn(() => ''),
}));

afterEach(() => {
    vi.restoreAllMocks();
});

describe('config hook - ssr.noExternal', () => {
    function getPlugin(aotCaches: true | object = true) {
        return mionVitePlugin({aotCaches});
    }

    it('should add aot-caches to noExternal when ssr config is undefined', () => {
        const plugin = getPlugin();
        const config: any = {};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should add aot-caches to noExternal when ssr.noExternal is undefined', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {}};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should append to existing noExternal array', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: ['some-other-module']}};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual(['some-other-module', AOT_CACHES_SHIM]);
    });

    it('should not duplicate if already in noExternal array', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: [AOT_CACHES_SHIM]}};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should wrap string noExternal into array with aot-caches', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: 'some-module'}};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual(['some-module', AOT_CACHES_SHIM]);
    });

    it('should wrap RegExp noExternal into array with aot-caches', () => {
        const plugin = getPlugin();
        const regex = /some-pattern/;
        const config: any = {ssr: {noExternal: regex}};
        plugin.config(config);
        expect(config.ssr.noExternal).toEqual([regex, AOT_CACHES_SHIM]);
    });

    it('should not modify noExternal when set to true', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: true}};
        plugin.config(config);
        expect(config.ssr.noExternal).toBe(true);
    });

    it('should not add noExternal when aotCaches is not configured', () => {
        const plugin = mionVitePlugin({});
        const config: any = {};
        plugin.config(config);
        expect(config.ssr).toBeUndefined();
    });
});

describe('resolveId hook - AOT caches', () => {
    function getPlugin() {
        return mionVitePlugin({aotCaches: true});
    }

    it('should resolve AOT_CACHES_SHIM to VIRTUAL_AOT_CACHES', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId(AOT_CACHES_SHIM, undefined);
        expect(result).toBe(resolveVirtualId(VIRTUAL_AOT_CACHES));
    });

    it('should resolve emptyCaches.ts imported by aotCaches.ts to VIRTUAL_AOT_CACHES', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId('./emptyCaches.ts', '/some/path/aotCaches.ts');
        expect(result).toBe(resolveVirtualId(VIRTUAL_AOT_CACHES));
    });

    it('should not resolve emptyCaches.ts when importer is not aotCaches.ts', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId('./emptyCaches.ts', '/some/path/other.ts');
        expect(result).toBeNull();
    });

    it('should not resolve aot-caches related ids when aotCaches is not configured', () => {
        const plugin = mionVitePlugin({});
        expect(plugin.resolveId(AOT_CACHES_SHIM, undefined)).toBeNull();
        expect(plugin.resolveId('./emptyCaches.ts', '/some/path/aotCaches.ts')).toBeNull();
    });
});
