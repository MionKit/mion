/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync, rmSync, mkdirSync, readFileSync} from 'fs';
import {join, resolve} from 'path';
import {writeAOTCachesToFiles, compileAOT, type CacheData} from './aot-compile';
import {initAOT} from './cli-init-aot';
import {headersHook, HeadersList, initRouter, registerRoutes, resetRouter, loadCompiledMethods} from '@mionkit/router';
import {getFnCaches, resetFnCaches, loadPersistedCaches} from '@mionkit/core';
import {getPersistedMethods} from '@mionkit/router';
import {hook, route} from '@mionkit/router';

const CODEGEN_ROOT = resolve(__dirname, '..');
// ensure artifact dirs is unique and not used by other tests
const TEST_ARTIFACTS_DIR = join(CODEGEN_ROOT, '.dist', 'test-artifacts-compile');
const TEMPLATE_DIR = join(CODEGEN_ROOT, 'mion-aot-template');
const TEST_ROUTER_PATH = join(__dirname, 'test', 'test-router.ts');

describe('AOT Cache Compilation E2E', () => {
    const testAotDir = join(TEST_ARTIFACTS_DIR, 'e2e-aot-test');
    process.env.MION_COMPILE = 'true';

    beforeAll(() => {
        // Ensure test artifacts directory exists
        if (!existsSync(TEST_ARTIFACTS_DIR)) {
            mkdirSync(TEST_ARTIFACTS_DIR, {recursive: true});
        }
    });

    beforeEach(() => {
        // Clean up first to ensure fresh state
        if (existsSync(testAotDir)) {
            try {
                rmSync(testAotDir, {recursive: true, force: true});
            } catch (error) {
                console.warn('Test setup cleanup failed:', (error as Error).message);
            }
        }

        // Reset router and caches
        resetRouter();
        resetFnCaches();

        // Create AOT package first
        initAOT({
            dir: testAotDir,
            templateDir: TEMPLATE_DIR,
        });
    });

    afterEach(() => {
        // Clean up after each test (unless SKIP_DELETE_ARTIFACTS is set)
        if (!process.env.SKIP_DELETE_ARTIFACTS && existsSync(testAotDir)) {
            rmSync(testAotDir, {recursive: true, force: true});
        }

        // Reset router and caches
        resetRouter();
        resetFnCaches();
    });

    it('should preserve cache data through file write and load cycle', async () => {
        // Step 1: Create AOT package (already done in beforeEach)

        // Step 2: Initialize server with some routes
        initRouter();

        const testRoutes = {
            auth: headersHook(
                (
                    ctx,
                    [token]: HeadersList<['Authorization']>, // testing headers serialization
                    userid: string // ensure we accept extra params
                ): HeadersList<['x-user-id']> => [userid]
            ),
            users: {
                getUser: route((id: string): string => `User ${id}`),
                setUser: route((id: string, name: string): string => `Set user ${id} to ${name}`),
                beforeUser: hook((): null => null),
            },
            pets: {
                getPet: route((id: string): string => `Pet ${id}`),
                afterPet: hook((): null => null),
            },
        };

        registerRoutes(testRoutes);

        // Step 3: Read all caches and create a list of their entries
        const originalCaches = getFnCaches();
        const originalRouterCache = getPersistedMethods();

        const originalCacheData: CacheData = {
            jitFnsCache: originalCaches.jitFnsCache,
            pureFnsCache: originalCaches.pureFnsCache,
            routerCache: originalRouterCache,
        };

        // Store the original cache keys for comparison
        const originalJitKeys = Object.keys(originalCacheData.jitFnsCache).sort();
        const originalPureKeys = Object.keys(originalCacheData.pureFnsCache).sort();
        const originalRouterKeys = Object.keys(originalCacheData.routerCache).sort();

        expect(originalJitKeys).not.toHaveLength(0);
        expect(originalRouterKeys).not.toHaveLength(0);

        // Step 4: Write caches to files
        writeAOTCachesToFiles(originalCacheData, resolve(testAotDir));

        // Step 5: Reset caches
        resetRouter();
        resetFnCaches();

        // Verify caches are empty after reset
        const emptyCaches = getFnCaches();
        const emptyRouterCache = getPersistedMethods();

        expect(Object.keys(emptyCaches.jitFnsCache)).toHaveLength(0);
        expect(Object.keys(emptyCaches.pureFnsCache)).toHaveLength(0);
        expect(Object.keys(emptyRouterCache)).toHaveLength(0);

        // Step 6: Dynamically load the cache objects from the created template and load them manually
        const aotPackagePath = join(testAotDir, 'build', 'cjs', 'src', 'index.js');

        const aotPackage = await import(aotPackagePath);

        // Verify cache objects are exported
        expect(aotPackage.jitFnsCache).toBeDefined();
        expect(aotPackage.pureFnsCache).toBeDefined();
        expect(aotPackage.routerCache).toBeDefined();

        // Load the AOT caches manually using the core and router loading functions
        loadPersistedCaches(aotPackage.jitFnsCache, aotPackage.pureFnsCache);
        loadCompiledMethods(aotPackage.routerCache);

        // Step 7: Read caches again and compare
        const reloadedCaches = getFnCaches();
        const reloadedRouterCache = getPersistedMethods();

        const reloadedJitKeys = Object.keys(reloadedCaches.jitFnsCache).sort();
        const reloadedPureKeys = Object.keys(reloadedCaches.pureFnsCache).sort();
        const reloadedRouterKeys = Object.keys(reloadedRouterCache).sort();

        // Compare the cache keys to verify original data was preserved
        // Note: Loading AOT caches may create additional entries, so we check that
        // all original keys are present (subset check)
        originalJitKeys.forEach((key) => {
            expect(reloadedJitKeys).toContain(key);
        });
        originalPureKeys.forEach((key) => {
            expect(reloadedPureKeys).toContain(key);
        });
        originalRouterKeys.forEach((key) => {
            expect(reloadedRouterKeys).toContain(key);
        });

        // Verify that we have at least the original number of entries
        expect(reloadedJitKeys.length).toBeGreaterThanOrEqual(originalJitKeys.length);
        expect(reloadedPureKeys.length).toBeGreaterThanOrEqual(originalPureKeys.length);
        expect(reloadedRouterKeys.length).toBeGreaterThanOrEqual(originalRouterKeys.length);

        // Verify cache files were created
        expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'jitFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'jitFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'pureFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'pureFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'router.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'router.cache.js'))).toBe(true);
    });
});

describe('AOT TypeScript File Compilation', () => {
    const testAotDir = join(TEST_ARTIFACTS_DIR, 'ts-aot-test');

    beforeAll(() => {
        // Ensure test artifacts directory exists
        if (!existsSync(TEST_ARTIFACTS_DIR)) {
            mkdirSync(TEST_ARTIFACTS_DIR, {recursive: true});
        }
    });

    beforeEach(() => {
        // Clean up first to ensure fresh state
        if (existsSync(testAotDir)) {
            try {
                rmSync(testAotDir, {recursive: true, force: true});
            } catch (error) {
                console.warn('Test setup cleanup failed:', (error as Error).message);
            }
        }

        // Reset router and caches
        resetRouter();
        resetFnCaches();

        // Create AOT package first
        initAOT({
            dir: testAotDir,
            templateDir: TEMPLATE_DIR,
        });
    });

    afterEach(() => {
        // Clean up after each test (unless SKIP_DELETE_ARTIFACTS is set)
        if (!process.env.SKIP_DELETE_ARTIFACTS && existsSync(testAotDir)) {
            rmSync(testAotDir, {recursive: true, force: true});
        }

        // Reset router and caches
        resetRouter();
        resetFnCaches();
    });

    it('should compile TypeScript router file using ts-node', async () => {
        // Use compileAOT with a TypeScript file
        await compileAOT({
            startScriptPath: TEST_ROUTER_PATH,
            aotDir: testAotDir,
            templateDir: TEMPLATE_DIR,
        });

        // Verify cache files were created
        expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'jitFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'jitFns.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'router.cache.js'))).toBe(true);
        expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'router.cache.js'))).toBe(true);

        // Verify caches have content from the test router
        const routerCache = getPersistedMethods();
        const routerKeys = Object.keys(routerCache);

        // Should have entries from test-router.ts routes
        expect(routerKeys.length).toBeGreaterThan(0);

        // The test router has routes like: auth, users/getUser, users/createUser, utils/sum, utils/echo, log
        expect(routerKeys.some((key) => key.includes('getUser'))).toBe(true);
        expect(routerKeys.some((key) => key.includes('sum'))).toBe(true);
    });

    it('should successfully run compilation twice without errors (cache reset)', async () => {
        // First compilation
        await compileAOT({
            startScriptPath: TEST_ROUTER_PATH,
            aotDir: testAotDir,
            templateDir: TEMPLATE_DIR,
        });

        // Verify first compilation created cache files with content
        const jitCachePathCjs = join(testAotDir, 'build', 'cjs', 'src', 'jitFns.cache.js');
        const routerCachePathCjs = join(testAotDir, 'build', 'cjs', 'src', 'router.cache.js');

        expect(existsSync(jitCachePathCjs)).toBe(true);
        expect(existsSync(routerCachePathCjs)).toBe(true);

        // Read the content after first compilation to verify it has data
        const firstJitContent = readFileSync(jitCachePathCjs, 'utf8');
        const firstRouterContent = readFileSync(routerCachePathCjs, 'utf8');

        // Verify the cache files have actual content (not just empty objects)
        expect(firstJitContent.length).toBeGreaterThan(100);
        expect(firstRouterContent.length).toBeGreaterThan(100);

        // Reset caches for second compilation
        resetRouter();
        resetFnCaches();

        // Second compilation - this should work without errors because cache files are reset
        await compileAOT({
            startScriptPath: TEST_ROUTER_PATH,
            aotDir: testAotDir,
            templateDir: TEMPLATE_DIR,
        });

        // Verify second compilation also created cache files
        expect(existsSync(jitCachePathCjs)).toBe(true);
        expect(existsSync(routerCachePathCjs)).toBe(true);

        // Read content after second compilation
        const secondJitContent = readFileSync(jitCachePathCjs, 'utf8');
        const secondRouterContent = readFileSync(routerCachePathCjs, 'utf8');

        // Verify the cache files still have content after second compilation
        expect(secondJitContent.length).toBeGreaterThan(100);
        expect(secondRouterContent.length).toBeGreaterThan(100);

        // The content should be similar (same routes compiled)
        expect(secondJitContent).toBe(firstJitContent);
        expect(secondRouterContent).toBe(firstRouterContent);
    });
});
