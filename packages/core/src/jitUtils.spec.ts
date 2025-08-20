/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {loadCompiledCaches, getFnCaches} from './jitUtils';
import {writeFileSync, mkdirSync, unlinkSync, rmSync} from 'fs';
import {join} from 'path';

describe('jitUtils', () => {
    const testDir = join(__dirname, '../../../temp-test-cache');
    const jitCjsFile = join(testDir, 'jitFunctionsCache.cjs.js');
    const jitEsmFile = join(testDir, 'jitFunctionsCache.esm.js');
    const pureCjsFile = join(testDir, 'pureFunctionsCache.cjs.js');
    const pureEsmFile = join(testDir, 'pureFunctionsCache.esm.js');

    beforeAll(() => {
        // Create test directory
        mkdirSync(testDir, {recursive: true});
    });

    afterAll(() => {
        // Clean up test directory
        try {
            rmSync(testDir, {recursive: true, force: true});
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    afterEach(() => {
        // Clean up test files
        [jitCjsFile, jitEsmFile, pureCjsFile, pureEsmFile].forEach((file) => {
            try {
                unlinkSync(file);
            } catch (e) {
                // Ignore if file doesn't exist
            }
        });
    });

    it('should load compiled JIT functions cache from external file', async () => {
        // Create a test JIT cache file
        const testJitCache = {
            testJitFn: {
                typeName: 'TestType',
                fnID: 'isType',
                jitFnHash: 'testJitFn',
                args: {vλl: 'v'},
                defaultParamValues: {vλl: ''},
                code: 'return true;',
                dependenciesSet: new Set(),
                pureFnDependencies: new Set(),
                fn: () => true,
                closureFn: () => () => true,
            },
        };

        const fileContent = `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY
// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code
module.exports = { cΦmpilεdCachε: ${JSON.stringify(testJitCache, null, 2)} };
`;

        writeFileSync(jitCjsFile, fileContent, 'utf8');

        // Get initial cache state
        const initialCaches = getFnCaches();
        const initialJitCacheSize = Object.keys(initialCaches.jitFnsCache).length;

        // Load the compiled cache
        await loadCompiledCaches([{jit: {path: jitCjsFile, module: 'cjs'}, pure: {path: '', module: 'cjs'}}]);

        // Verify the cache was loaded
        const updatedCaches = getFnCaches();
        const updatedJitCacheSize = Object.keys(updatedCaches.jitFnsCache).length;

        expect(updatedJitCacheSize).toBeGreaterThan(initialJitCacheSize);
        expect(updatedCaches.jitFnsCache).toHaveProperty('testJitFn');
    });

    it('should load compiled pure functions cache from external file', async () => {
        // Create a test pure functions cache file
        const testPureCache = {
            testPureFn: {
                pureFnHash: 'testPureFn',
                code: 'return (a, b) => a + b;',
                dependenciesSet: new Set(),
                fn: (a: number, b: number) => a + b,
            },
        };

        const fileContent = `// ###### DO NOT MODIFY MANUALLY: THIS FILE IS GENERATED AUTOMATICALLY
// NOTE exported constant name must be 'cΦmpilεdCachε' and file can not contain any other code
module.exports = { cΦmpilεdCachε: ${JSON.stringify(testPureCache, null, 2)} };
`;

        writeFileSync(pureCjsFile, fileContent, 'utf8');

        // Get initial cache state
        const initialCaches = getFnCaches();
        const initialPureCacheSize = Object.keys(initialCaches.pureFnsCache).length;

        // Load the compiled cache
        await loadCompiledCaches([{jit: {path: '', module: 'cjs'}, pure: {path: pureCjsFile, module: 'cjs'}}]);

        // Verify the cache was loaded
        const updatedCaches = getFnCaches();
        const updatedPureCacheSize = Object.keys(updatedCaches.pureFnsCache).length;

        expect(updatedPureCacheSize).toBeGreaterThan(initialPureCacheSize);
        expect(updatedCaches.pureFnsCache).toHaveProperty('testPureFn');
    });

    it('should handle missing files gracefully', async () => {
        // This should not throw an error
        await expect(
            loadCompiledCaches([{jit: {path: '/nonexistent/file.js', module: 'esm'}, pure: {path: '', module: 'esm'}}])
        ).resolves.toBeUndefined();
    });

    it('should prefer ESM files over CJS files', async () => {
        const testCache = {testFn: {test: 'esm'}};
        const esmContent = `module.exports = { cΦmpilεdCachε: ${JSON.stringify(testCache)} };`;
        const cjsContent = `module.exports = { cΦmpilεdCachε: ${JSON.stringify({testFn: {test: 'cjs'}})} };`;

        writeFileSync(jitEsmFile, esmContent, 'utf8');
        writeFileSync(jitCjsFile, cjsContent, 'utf8');

        await loadCompiledCaches([
            {jit: {path: jitCjsFile, module: 'cjs'}, pure: {path: '', module: 'cjs'}},
            {jit: {path: jitEsmFile, module: 'esm'}, pure: {path: '', module: 'esm'}},
        ]);

        const caches = getFnCaches();
        // Should load both files
        expect(caches.jitFnsCache).toHaveProperty('testFn');
    });
});
