import {describe, it, expect, vi, afterEach} from 'vitest';
import {mionVitePlugin} from './mionVitePlugin.ts';
import {SERVER_PURE_FNS_SHIM} from './constants.ts';
import {generateCombinedCachesModule, generateNoopCombinedModule} from './aotCacheGenerator.ts';

afterEach(() => {
    vi.restoreAllMocks();
});

describe('config hook - ssr.noExternal', () => {
    const serveEnv: any = {command: 'serve', mode: 'development'};

    it('does not add anything to noExternal when only aotCaches is enabled (no shim modules)', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const config: any = {};
        plugin.config(config, serveEnv);
        expect(config.ssr).toBeUndefined();
    });

    it('adds SERVER_PURE_FNS_SHIM to noExternal when serverPureFunctions is configured', () => {
        const plugin = mionVitePlugin({
            aotCaches: true,
            serverPureFunctions: {clientSrcPath: '/tmp/client'},
        });
        const config: any = {};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([SERVER_PURE_FNS_SHIM]);
    });

    it('appends SERVER_PURE_FNS_SHIM to existing noExternal array', () => {
        const plugin = mionVitePlugin({serverPureFunctions: {clientSrcPath: '/tmp/client'}});
        const config: any = {ssr: {noExternal: ['some-other-module']}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual(['some-other-module', SERVER_PURE_FNS_SHIM]);
    });

    it('does not duplicate if already in noExternal array', () => {
        const plugin = mionVitePlugin({serverPureFunctions: {clientSrcPath: '/tmp/client'}});
        const config: any = {ssr: {noExternal: [SERVER_PURE_FNS_SHIM]}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toEqual([SERVER_PURE_FNS_SHIM]);
    });

    it('preserves noExternal === true', () => {
        const plugin = mionVitePlugin({serverPureFunctions: {clientSrcPath: '/tmp/client'}});
        const config: any = {ssr: {noExternal: true}};
        plugin.config(config, serveEnv);
        expect(config.ssr.noExternal).toBe(true);
    });

    it('does not force @mionjs/* into noExternal even with serverConfig set', () => {
        // After 0.9, the plugin no longer needs to bundle @mionjs source — caches are
        // explicit data, not side effects, so externalization is safe.
        const plugin = mionVitePlugin({
            aotCaches: true,
            server: {startScript: '/tmp/start.ts', runMode: 'buildOnly'},
        });
        const config: any = {};
        plugin.config(config, serveEnv);
        expect(config.ssr).toBeUndefined();
    });
});

describe('config hook - build.rollupOptions.external default', () => {
    const buildEnv: any = {command: 'build', mode: 'production'};

    it('installs a default external function when aotCaches is enabled', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const config: any = {};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        expect(typeof ext).toBe('function');
    });

    it('default external bundles virtual:mion* modules', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const config: any = {};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        expect(ext('virtual:mion-aot/caches')).toBe(false);
        expect(ext('virtual:mion-aot/jit-fns')).toBe(false);
    });

    it('default external bundles SERVER_PURE_FNS_SHIM when configured', () => {
        const plugin = mionVitePlugin({
            aotCaches: true,
            serverPureFunctions: {clientSrcPath: '/tmp/client'},
        });
        const config: any = {};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        expect(ext(SERVER_PURE_FNS_SHIM)).toBe(false);
    });

    it('default external externalizes @mionjs/* and other bare specifiers', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const config: any = {};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        expect(ext('@mionjs/platform-node')).toBe(true);
        expect(ext('@mionjs/router')).toBe(true);
        expect(ext('@mionjs/core')).toBe(true);
        expect(ext('node:fs')).toBe(true);
        expect(ext('pino')).toBe(true);
    });

    it('default external bundles relative paths', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const config: any = {};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        expect(ext('./local-module')).toBe(false);
        expect(ext('../sibling')).toBe(false);
    });

    it('original function external still wins for ids it returns true/false on', () => {
        const plugin = mionVitePlugin({aotCaches: true});
        const original = vi.fn((id: string) => (id === 'force-bundled' ? false : id === 'force-external' ? true : undefined));
        const config: any = {build: {rollupOptions: {external: original}}};
        plugin.config(config, buildEnv);
        const ext = config.build.rollupOptions.external;
        // Plugin carve-outs always win
        expect(ext('virtual:mion-aot/caches')).toBe(false);
        // Original function decisions are honored
        expect(ext('force-bundled')).toBe(false);
        expect(ext('force-external')).toBe(true);
        // Fallback to bare-specifier rule when original returns undefined
        expect(ext('@mionjs/platform-node')).toBe(true);
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

describe('combined virtual module — pure data shape', () => {
    it('generated module has no addAOTCaches / addRoutesToCache / loadCompiledMethods side effects', () => {
        const code = generateCombinedCachesModule();
        expect(code).not.toContain('addAOTCaches');
        expect(code).not.toContain('addRoutesToCache');
        expect(code).not.toContain('loadCompiledMethods');
        expect(code).not.toContain("from '@mionjs/core'");
        expect(code).not.toContain("from '@mionjs/router'");
    });

    it('generated module exports the bundled aotCaches and the three individual caches', () => {
        const code = generateCombinedCachesModule();
        expect(code).toMatch(/export const aotCaches = \{ jitFnsCache, pureFnsCache, routerCache \}/);
        expect(code).toContain('jitFnsCache');
        expect(code).toContain('pureFnsCache');
        expect(code).toContain('routerCache');
    });

    it('noop combined module exports empty caches and nothing else', () => {
        const code = generateNoopCombinedModule();
        expect(code).toContain('export const jitFnsCache = {}');
        expect(code).toContain('export const pureFnsCache = {}');
        expect(code).toContain('export const routerCache = {}');
        expect(code).toMatch(/export const aotCaches = \{ jitFnsCache, pureFnsCache, routerCache \}/);
        expect(code).not.toContain('loadAOTCaches');
        expect(code).not.toContain('getRawAOTCaches');
        expect(code).not.toContain('addAOTCaches');
    });
});
