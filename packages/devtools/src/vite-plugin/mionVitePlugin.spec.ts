import {resolve} from 'path';
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
    const serveEnv: any = {command: 'serve', mode: 'development'};

    function getPlugin(aotCaches: true | object = true) {
        return mionVitePlugin({aotCaches});
    }

    it('should add aot-caches to noExternal when ssr config is undefined', () => {
        const plugin = getPlugin();
        const config: any = {};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should add aot-caches to noExternal when ssr.noExternal is undefined', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should append to existing noExternal array', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: ['some-other-module']}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual(['some-other-module', AOT_CACHES_SHIM]);
    });

    it('should not duplicate if already in noExternal array', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: [AOT_CACHES_SHIM]}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([AOT_CACHES_SHIM]);
    });

    it('should wrap string noExternal into array with aot-caches', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: 'some-module'}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual(['some-module', AOT_CACHES_SHIM]);
    });

    it('should wrap RegExp noExternal into array with aot-caches', () => {
        const plugin = getPlugin();
        const regex = /some-pattern/;
        const config: any = {ssr: {noExternal: regex}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([regex, AOT_CACHES_SHIM]);
    });

    it('should not modify noExternal when set to true', () => {
        const plugin = getPlugin();
        const config: any = {ssr: {noExternal: true}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toBe(true);
    });

    it('should not add noExternal when no shim features are configured', () => {
        const plugin = mionVitePlugin({});
        const config: any = {};
        plugin.config(config, serveEnv);
        expect(config.ssr).toBeUndefined();
    });
});

describe('transform hook - @mionjs build artifact skipping', () => {
    it('should skip @mionjs/.dist/ files', () => {
        const plugin = mionVitePlugin({});
        const code = `function registerPureFnFactory() {}`;
        const result = plugin.transform(code, '/project/node_modules/@mionjs/core/.dist/esm/src/pureFns/pureFn.js');
        expect(result).toBeNull();
    });

    it('should skip @mionjs/build/ files', () => {
        const plugin = mionVitePlugin({});
        const code = `function registerPureFnFactory() {}`;
        const result = plugin.transform(code, '/project/node_modules/@mionjs/devtools/build/vite-plugin/foo.js');
        expect(result).toBeNull();
    });

    it('should skip @mionjs/.dist/ files with query params', () => {
        const plugin = mionVitePlugin({});
        const code = `function registerPureFnFactory() {}`;
        const result = plugin.transform(code, '/project/node_modules/@mionjs/core/.dist/esm/src/pureFns/pureFn.js?v=123');
        expect(result).toBeNull();
    });

    it('should skip Vite pre-bundled cache files (.cache/vite/)', () => {
        const plugin = mionVitePlugin({});
        const code = `function mapFrom() {}`;
        const result = plugin.transform(code, '/project/node_modules/.cache/vite/client/deps/@mionjs_client.js');
        expect(result).toBeNull();
    });

    it('should skip Vite dep cache files (.vite/deps/)', () => {
        const plugin = mionVitePlugin({});
        const code = `function mapFrom() {}`;
        const result = plugin.transform(code, '/project/node_modules/.vite/deps/@mionjs_client.js');
        expect(result).toBeNull();
    });

    it('should not skip non-@mionjs node_modules files', () => {
        const plugin = mionVitePlugin({});
        const code = `export const x = 1;`;
        // Non-@mionjs file without pureFns or deepkit — returns null because no transforms needed, not because of the guard
        const result = plugin.transform(code, '/project/node_modules/some-lib/dist/index.js');
        expect(result).toBeNull();
    });
});

describe('resolveId hook - AOT caches', () => {
    function getPlugin() {
        return mionVitePlugin({aotCaches: true});
    }

    it('should resolve bare specifier @mionjs/core/aot-caches to aotCaches source or virtual module', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId(AOT_CACHES_SHIM, undefined);
        // In dev (no .dist build), createRequire falls back to virtual module; in CI/publish it resolves to source
        expect(result).toMatch(/aotCaches\.(js|cjs|mjs|ts)$|virtual:mion-aot\/caches/);
    });

    it('should resolve alias-resolved absolute /aot-caches path to source aotCaches.ts', () => {
        const coreDir = resolve(__dirname, '../../../core');
        const aliasResolved = resolve(coreDir, 'aot-caches');
        const plugin = getPlugin();
        const result = plugin.resolveId(aliasResolved, undefined);
        expect(result).toBe(resolve(coreDir, 'src/aot/aotCaches.ts'));
    });

    it('should resolve emptyCaches.ts imported by aotCaches.ts to VIRTUAL_AOT_CACHES', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId('./emptyCaches.ts', '/some/path/aotCaches.ts');
        expect(result).toBe(resolveVirtualId(VIRTUAL_AOT_CACHES));
    });

    it('should resolve emptyCaches.js imported by aotCaches.js to VIRTUAL_AOT_CACHES', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId('./emptyCaches.js', '/some/path/.dist/esm/src/aot/aotCaches.js');
        expect(result).toBe(resolveVirtualId(VIRTUAL_AOT_CACHES));
    });

    it('should resolve emptyCaches.cjs imported by aotCaches.cjs to VIRTUAL_AOT_CACHES', () => {
        const plugin = getPlugin();
        const result = plugin.resolveId('./emptyCaches.cjs', '/some/path/.dist/cjs/src/aot/aotCaches.cjs');
        expect(result).toBe(resolveVirtualId(VIRTUAL_AOT_CACHES));
    });

    it('should not resolve emptyCaches when importer is not aotCaches', () => {
        const plugin = getPlugin();
        expect(plugin.resolveId('./emptyCaches.ts', '/some/path/other.ts')).toBeNull();
        expect(plugin.resolveId('./emptyCaches.js', '/some/path/other.js')).toBeNull();
    });

    it('should not resolve emptyCaches when there is no importer', () => {
        const plugin = getPlugin();
        expect(plugin.resolveId('./emptyCaches.ts', undefined)).toBeNull();
    });

    it('should not resolve emptyCaches when aotCaches is not configured', () => {
        const plugin = mionVitePlugin({});
        expect(plugin.resolveId('./emptyCaches.ts', '/some/path/aotCaches.ts')).toBeNull();
    });
});
