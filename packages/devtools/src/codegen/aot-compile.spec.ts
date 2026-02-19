/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync, rmSync, mkdirSync, readFileSync} from 'fs';
import {join, resolve} from 'path';
import {
    writeAOTCachesToFiles,
    compileAOT,
    filterUsedJitFns,
    filterUsedPureFns,
    filterUsedRouterCache,
    resetCompileTracking,
    type CacheData,
} from './aot-compile.js';
import {initAOT} from './cli-init-aot.js';
import {headersFn, initRouter, registerRoutes, resetRouter, loadCompiledMethods} from '@mionkit/router';
import {getJitFnCaches, resetJitFnCaches, addAOTCaches, HeadersSubset, getJitUtils} from '@mionkit/core';
import type {Cacheable} from './aot-compile.js';
// Import pure functions to re-register them after resetJitFnCaches
import {
    cpf_asJSONString,
    cpf_getUnknownKeysFromArray,
    cpf_hasUnknownKeysFromArray,
    cpf_newRunTypeErr,
    cpf_formatErr,
    cpf_safeIterableKey,
    cpf_sanitizeCompiledFn,
} from '@mionkit/run-types/src/run-types-pure-fns.ts';

/** Re-registers run-types pure functions after resetJitFnCaches() */
function reRegisterRunTypesPureFns(): void {
    const {addPureFn} = getJitUtils();
    addPureFn('mion', cpf_asJSONString);
    addPureFn('mion', cpf_getUnknownKeysFromArray);
    addPureFn('mion', cpf_hasUnknownKeysFromArray);
    addPureFn('mion', cpf_newRunTypeErr);
    addPureFn('mion', cpf_formatErr);
    addPureFn('mion', cpf_safeIterableKey);
    addPureFn('mion', cpf_sanitizeCompiledFn);
}
import {getPersistedMethods} from '@mionkit/router';
import {linkedFn, route} from '@mionkit/router';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
// ensure artifact dirs is unique and not used by other tests
const TEST_ARTIFACTS_DIR = join(PACKAGE_ROOT, '.dist', 'test-artifacts-compile');
const TEMPLATE_DIR = join(PACKAGE_ROOT, 'mion-aot-template');
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
        resetJitFnCaches();
        reRegisterRunTypesPureFns();

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
        resetJitFnCaches();
        resetCompileTracking();

        // Clean up require cache to prevent state pollution to other tests
        Object.keys(require.cache).forEach((key) => {
            if (key.includes('e2e-aot-test') || key.includes('e2e-eviction-test') || key.includes('test-router')) {
                delete require.cache[key];
            }
        });
    });

    it('should preserve cache data through file write and load cycle', async () => {
        // Step 1: Create AOT package (already done in beforeEach)

        // Step 2: Initialize server with some routes
        await initRouter();

        const testRoutes = {
            auth: headersFn(
                (
                    ctx,
                    h: HeadersSubset<'Authorization'>, // testing headers serialization
                    userid: string // ensure we accept extra params
                ): HeadersSubset<'x-user-id'> => new HeadersSubset({'x-user-id': userid})
            ),
            users: {
                getUser: route((id: string): string => `User ${id}`),
                setUser: route((id: string, name: string): string => `Set user ${id} to ${name}`),
                beforeUser: linkedFn((): null => null),
            },
            pets: {
                getPet: route((id: string): string => `Pet ${id}`),
                afterPet: linkedFn((): null => null),
            },
        };

        await registerRoutes(testRoutes);

        // Step 3: Read all caches and create a list of their entries
        const originalCaches = getJitFnCaches();
        const originalRouterCache = getPersistedMethods();

        Object.values(originalCaches.jitFnsCache).forEach((value) => {
            (value as Cacheable)._used = true;
        });
        Object.values(originalCaches.pureFnsCache).forEach((nsCache) => {
            Object.values(nsCache).forEach((value) => {
                (value as Cacheable)._used = true;
            });
        });
        Object.values(originalRouterCache).forEach((value) => {
            (value as Cacheable)._used = true;
        });

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
        resetJitFnCaches();

        // Verify router cache is empty after reset (jit/pure caches are reloaded from @mionkit/aot-caches)
        const emptyRouterCache = getPersistedMethods();
        expect(Object.keys(emptyRouterCache)).toHaveLength(0);

        // Step 6: Dynamically load the cache objects from the created template and load them manually
        const aotPackagePath = join(testAotDir, 'build', 'esm', 'src', 'index.js');

        const aotPackage = await import(aotPackagePath);

        // Verify cache objects are exported
        expect(aotPackage.jitFnsCache).toBeDefined();
        expect(aotPackage.pureFnsCache).toBeDefined();
        expect(aotPackage.routerCache).toBeDefined();

        // Load the AOT caches manually using the core and router loading functions
        addAOTCaches(aotPackage.jitFnsCache, aotPackage.pureFnsCache);
        loadCompiledMethods(aotPackage.routerCache);

        // Step 7: Read caches again and compare
        const reloadedCaches = getJitFnCaches();
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

describe('AOT cache _used', () => {
    it('should keep only used entries and reset _used', () => {
        const jitCache = {
            used: {fnID: 'isType', jitFnHash: 'used'} as any,
            unused: {fnID: 'isType', jitFnHash: 'unused'} as any,
        };
        jitCache.used._used = true;
        jitCache.unused._used = false;

        const pureCache = {
            ns: {
                used: {pureFnHash: 'used'} as any,
                unused: {pureFnHash: 'unused'} as any,
            },
        };
        pureCache.ns.used._used = true;
        pureCache.ns.unused._used = false;

        const routerCache = {
            used: {_used: true, id: 'used'} as any,
            unused: {_used: false, id: 'unused'} as any,
        };

        const filteredJit = filterUsedJitFns(jitCache as any);
        expect(filteredJit.used).toBeDefined();
        expect(filteredJit.unused).toBeUndefined();
        expect((filteredJit.used as Cacheable)._used).toBeUndefined();

        const filteredPure = filterUsedPureFns(pureCache as any);
        expect(filteredPure.ns.used).toBeDefined();
        expect(filteredPure.ns.unused).toBeUndefined();
        expect((filteredPure.ns.used as Cacheable)._used).toBeUndefined();

        const filteredRouter = filterUsedRouterCache(routerCache);
        expect(filteredRouter.used).toBeDefined();
        expect(filteredRouter.unused).toBeUndefined();
        expect(filteredRouter.used._used).toBeUndefined();
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
        resetJitFnCaches();
        reRegisterRunTypesPureFns();
        resetCompileTracking();

        // Clean up require cache to prevent state pollution from previous tests
        Object.keys(require.cache).forEach((key) => {
            if (key.includes('test-router')) {
                delete require.cache[key];
            }
        });

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
        resetJitFnCaches();
        resetCompileTracking();
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
        resetJitFnCaches();
        reRegisterRunTypesPureFns();

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

        // The router content should be identical (same routes compiled)
        // Note: JIT content may differ because resetJitFnCaches() reloads AOT caches from @mionkit/aot-caches
        expect(secondRouterContent).toBe(firstRouterContent);
    });
});
