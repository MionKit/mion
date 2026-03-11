/* ########
 * 2026 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

/**
 * E2E test for SSR AOT cache generation.
 *
 * This test runs as a standalone script via Node (NOT inside vitest)
 * because vitest's module runner transport conflicts with creating
 * a second Vite dev server inside a test worker.
 *
 * Run with: node --experimental-strip-types packages/client/src/aot/aotSSR.e2e.test.ts
 */

import {createServer} from 'vite';
import type {ViteDevServer} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';
import assert from 'node:assert/strict';

const routerDir = resolve(import.meta.dirname, '../../../router');
const defaultRoutesPath = resolve(routerDir, 'src/defaultRoutes.ts');

let server: ViteDevServer;
let passed = 0;
let failed = 0;

async function test(name: string, fn: () => Promise<void>) {
    return fn()
        .then(() => {
            passed++;
            console.log(`  ✅ ${name}`);
        })
        .catch((err: any) => {
            failed++;
            console.log(`  ❌ ${name}`);
            console.error(`     ${err.message}`);
        });
}

/** Loads a module using ssrLoadModule (middlewareMode) */
function createModuleLoader(server: ViteDevServer): (url: string) => Promise<Record<string, any>> {
    return (url: string) => server.ssrLoadModule(url);
}

async function run() {
    console.log('\n🔧 Creating Vite dev server with SSR AOT...\n');

    server = await createServer({
        configFile: false,
        resolve: {conditions: ['source']},
        ssr: {resolve: {conditions: ['source']}},
        server: {middlewareMode: true},
        plugins: [
            mionVitePlugin({
                runTypes: {
                    tsConfig: resolve(routerDir, 'tsconfig.json'),
                },
                aotCaches: {
                    startServerScript: defaultRoutesPath,
                },
            }) as any,
        ],
    });

    const loadModule = createModuleLoader(server);

    console.log('--- Server creation ---');
    await test('should create server without errors', async () => {
        assert.ok(server, 'Server should be defined');
    });

    console.log('\n--- Virtual module resolution ---');

    await test('should resolve virtual:mion-aot/jit-fns and export jitFnsCache', async () => {
        const mod = await loadModule('virtual:mion-aot/jit-fns');
        assert.ok(mod.jitFnsCache, 'jitFnsCache should be defined');
        assert.equal(typeof mod.jitFnsCache, 'object');
        assert.notEqual(mod.jitFnsCache, null);
    });

    await test('should resolve virtual:mion-aot/pure-fns and export pureFnsCache', async () => {
        const mod = await loadModule('virtual:mion-aot/pure-fns');
        assert.ok(mod.pureFnsCache !== undefined, 'pureFnsCache should be defined');
        assert.equal(typeof mod.pureFnsCache, 'object');
    });

    await test('should resolve virtual:mion-aot/router-cache and export routerCache', async () => {
        const mod = await loadModule('virtual:mion-aot/router-cache');
        assert.ok(mod.routerCache, 'routerCache should be defined');
        assert.equal(typeof mod.routerCache, 'object');
    });

    await test('should resolve virtual:mion-aot/caches and export all three caches', async () => {
        const mod = await loadModule('virtual:mion-aot/caches');
        assert.ok(mod.jitFnsCache !== undefined, 'jitFnsCache should be defined');
        assert.ok(mod.pureFnsCache !== undefined, 'pureFnsCache should be defined');
        assert.ok(mod.routerCache !== undefined, 'routerCache should be defined');
    });

    console.log('\n--- AOT cache content ---');

    await test('should generate non-empty router cache', async () => {
        const mod = await loadModule('virtual:mion-aot/router-cache');
        assert.ok(Object.keys(mod.routerCache).length > 0, 'routerCache should not be empty');
    });

    await test('should include internal mion routes in router cache', async () => {
        const mod = await loadModule('virtual:mion-aot/router-cache');
        assert.ok(mod.routerCache['mion@methodsMetadataById'], 'should have methodsMetadataById');
        assert.ok(mod.routerCache['mion@methodsMetadataByPath'], 'should have methodsMetadataByPath');
        assert.ok(mod.routerCache['mion@notFound'], 'should have notFound');
        assert.ok(mod.routerCache['mion@platformError'], 'should have platformError');
    });

    await test('should include route metadata with expected structure', async () => {
        const mod = await loadModule('virtual:mion-aot/router-cache');
        const metadataById = mod.routerCache['mion@methodsMetadataById'];
        assert.ok(metadataById, 'metadataById should be defined');
        assert.ok(metadataById.id, 'metadataById should have id');
        assert.equal(metadataById.id, 'mion@methodsMetadataById');
    });

    await test('should generate non-empty JIT functions cache', async () => {
        const mod = await loadModule('virtual:mion-aot/jit-fns');
        assert.ok(Object.keys(mod.jitFnsCache).length > 0, 'jitFnsCache should not be empty');
    });

    await test('should include JIT function entries with serialized function data', async () => {
        const mod = await loadModule('virtual:mion-aot/jit-fns');
        const firstKey = Object.keys(mod.jitFnsCache)[0];
        const entry = mod.jitFnsCache[firstKey];
        assert.ok(entry, 'first entry should be defined');
        assert.equal(typeof entry, 'object');
    });

    await server.close();

    console.log(`\n📊 Results: ${passed} passed, ${failed} failed\n`);

    if (failed > 0) {
        process.exit(1);
    }
}

run().catch((err) => {
    console.error('Fatal error:', err);
    server?.close();
    process.exit(1);
});
