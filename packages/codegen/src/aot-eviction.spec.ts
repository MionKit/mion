/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync, rmSync, mkdirSync, readFileSync} from 'fs';
import {join, resolve} from 'path';
import {compileAOT, resetCompileTracking} from './aot-compile.js';
import {initAOT} from './cli-init-aot.js';
import {resetRouter, loadCompiledMethods} from '@mionkit/router';
import {resetJitFnCaches, addAOTCaches} from '@mionkit/core';
import {getPersistedMethods} from '@mionkit/router';

const CODEGEN_ROOT = resolve(__dirname, '..');
const TEST_ARTIFACTS_DIR = join(CODEGEN_ROOT, '.dist', 'test-artifacts-eviction');
const TEMPLATE_DIR = join(CODEGEN_ROOT, 'mion-aot-template');
const TEST_ROUTER_PATH = join(__dirname, 'test', 'test-router.ts');
const TEST_ROUTER_MODIFIED_PATH = join(__dirname, 'test', 'test-router-modified.ts');

// This test is in a separate file to ensure complete isolation from other tests.
// The test modifies global state (enableCompileTracking) and imports test router modules
// which can cause state pollution when run alongside other tests.
describe('AOT Cache Eviction E2E', () => {
    const evictionTestDir = join(TEST_ARTIFACTS_DIR, 'e2e-eviction-test');

    beforeAll(() => {
        // Ensure test artifacts directory exists
        if (!existsSync(TEST_ARTIFACTS_DIR)) {
            mkdirSync(TEST_ARTIFACTS_DIR, {recursive: true});
        }
    });

    afterAll(() => {
        // Clean up require cache
        Object.keys(require.cache).forEach((key) => {
            if (key.includes('e2e-eviction-test') || key.includes('test-router')) {
                delete require.cache[key];
            }
        });

        // Reset state
        resetRouter();
        resetJitFnCaches();
        resetCompileTracking();

        // Clean up artifacts
        if (!process.env.SKIP_DELETE_ARTIFACTS && existsSync(evictionTestDir)) {
            rmSync(evictionTestDir, {recursive: true, force: true});
        }
    });

    it('should evict unused cache entries when source changes between builds', async () => {
        // This E2E test verifies that cache entries not used in a subsequent build are evicted.
        // Step 1: First compilation with test-router.ts (has users routes)
        // Step 2: Load the AOT caches
        // Step 3: Second compilation with test-router-modified.ts (has products routes instead of users)
        // Step 4: Verify that users routes are evicted and products routes are present

        // Clean up first
        if (existsSync(evictionTestDir)) {
            rmSync(evictionTestDir, {recursive: true, force: true});
        }

        // Create AOT package
        initAOT({
            dir: evictionTestDir,
            templateDir: TEMPLATE_DIR,
        });

        // Step 1: First compilation with test-router.ts
        await compileAOT({
            startScriptPath: TEST_ROUTER_PATH,
            aotDir: evictionTestDir,
            templateDir: TEMPLATE_DIR,
        });

        // Verify first compilation created cache files
        const routerCachePathCjs = join(evictionTestDir, 'build', 'cjs', 'src', 'router.cache.js');
        const jitCachePathCjs = join(evictionTestDir, 'build', 'cjs', 'src', 'jitFns.cache.js');
        expect(existsSync(routerCachePathCjs)).toBe(true);
        expect(existsSync(jitCachePathCjs)).toBe(true);

        // Read the cache contents after first compilation
        const firstRouterContent = readFileSync(routerCachePathCjs, 'utf8');
        const firstJitContent = readFileSync(jitCachePathCjs, 'utf8');

        // Verify first compilation has users routes (from test-router.ts)
        expect(firstRouterContent).toContain('getUser');
        expect(firstRouterContent).toContain('createUser');
        // Should NOT have products routes yet
        expect(firstRouterContent).not.toContain('getProduct');
        expect(firstRouterContent).not.toContain('createProduct');

        // Step 2: Reset caches and load AOT caches from first compilation
        resetRouter();
        resetJitFnCaches();

        const aotPackagePath = join(evictionTestDir, 'build', 'esm', 'src', 'index.js');
        const aotPackage = await import(aotPackagePath);

        // Load the AOT caches
        addAOTCaches(aotPackage.jitFnsCache, aotPackage.pureFnsCache);
        loadCompiledMethods(aotPackage.routerCache);

        // Store first compilation JIT keys for later comparison
        const firstCompilationJitKeys = Object.keys(aotPackage.jitFnsCache).sort();
        expect(firstCompilationJitKeys.length).toBeGreaterThan(0);

        // Verify caches are loaded with first compilation data
        const loadedRouterCache = getPersistedMethods();
        const loadedRouterKeys = Object.keys(loadedRouterCache);
        expect(loadedRouterKeys.some((key) => key.includes('getUser'))).toBe(true);
        expect(loadedRouterKeys.some((key) => key.includes('createUser'))).toBe(true);

        // Step 3: Second compilation with test-router-modified.ts (different routes)
        // This should use the loaded caches and mark only used entries
        await compileAOT({
            startScriptPath: TEST_ROUTER_MODIFIED_PATH,
            aotDir: evictionTestDir,
            templateDir: TEMPLATE_DIR,
        });

        // Step 4: Verify cache eviction - users routes should be gone, products routes should be present
        const secondRouterContent = readFileSync(routerCachePathCjs, 'utf8');
        const secondJitContent = readFileSync(jitCachePathCjs, 'utf8');

        // Should have products routes (from test-router-modified.ts)
        expect(secondRouterContent).toContain('getProduct');
        expect(secondRouterContent).toContain('createProduct');

        // Should NOT have users routes anymore (evicted because not used in second compilation)
        expect(secondRouterContent).not.toContain('getUser');
        expect(secondRouterContent).not.toContain('createUser');

        // Should still have common routes (auth, utils, log)
        expect(secondRouterContent).toContain('auth');
        expect(secondRouterContent).toContain('sum');
        expect(secondRouterContent).toContain('echo');
        expect(secondRouterContent).toContain('log');

        // Verify JIT cache content changed between compilations
        // The JIT cache should be different because User type (from test-router.ts) is replaced by Product type
        expect(firstJitContent).not.toBe(secondJitContent);

        // Verify the JIT cache files have content
        expect(firstJitContent.length).toBeGreaterThan(100);
        expect(secondJitContent.length).toBeGreaterThan(100);
    });
});
