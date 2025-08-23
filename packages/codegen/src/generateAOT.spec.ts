/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {generateAOTCaches} from './generateAOT';
// Note: loadRouterCache and loadCoreCache are now internal functions used by router
// They are tested indirectly through router integration
import {rmSync, existsSync} from 'fs';
import {join} from 'path';
import {initRouter, registerRoutes, route, resetRouter, resetPersistedMethods, getPersistedMethods} from '@mionkit/router';

describe('AOT Cache System', () => {
    const testOutputDir = join(__dirname, '../.dist/test-cache');

    afterEach(() => {
        // Skip cleanup if user wants to preserve artifacts for manual inspection
        if (process.env.PRESERVE_TEST_ARTIFACTS === 'true') {
            console.log(`[PRESERVE] Test artifacts preserved in: ${testOutputDir}`);
            return;
        }

        // Clean up any generated test files
        if (existsSync(testOutputDir)) {
            rmSync(testOutputDir, {recursive: true, force: true});
        }
    });

    afterAll(() => {
        // Skip cleanup if user wants to preserve artifacts for manual inspection
        if (process.env.PRESERVE_TEST_ARTIFACTS === 'true') {
            console.log('[PRESERVE] All test artifacts preserved - skipping final cleanup');
            return;
        }

        // Final cleanup of any stray test artifacts that might have escaped
        const strayArtifactDirs = [
            join(__dirname, '../.dist'),
            join(__dirname, '../../test-cache'),
            join(__dirname, '../../test-cache-new'),
            join(__dirname, '../../non-existent-parent'),
        ];

        for (const dir of strayArtifactDirs) {
            if (existsSync(dir)) {
                try {
                    rmSync(dir, {recursive: true, force: true});
                } catch {
                    // Silently ignore cleanup failures
                }
            }
        }
    });
    // Note: Cache loading tests are now handled by router integration tests
    // since loadRouterCache and loadCoreCache are internal functions

    describe('generateAOTCaches', () => {
        it('should handle empty caches gracefully', async () => {
            const result = await generateAOTCaches({
                outputDir: testOutputDir,
                verbose: false,
            });

            // Should succeed but with warnings about empty caches
            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some((w) => w.includes('No router methods found'))).toBe(true);
        });

        it('should create output directory if it does not exist', async () => {
            const testDir = join(__dirname, '../.dist/test-cache-new');
            const result = await generateAOTCaches({
                outputDir: testDir,
                generateRouter: false,
                generateJitFunctions: false,
                generatePureFunctions: false,
                verbose: false,
            });

            expect(result.success).toBe(true);
            expect(result.generatedFiles).toHaveLength(0);

            // Clean up this specific test directory
            if (existsSync(testDir)) {
                rmSync(testDir, {recursive: true, force: true});
            }
        });

        it('should generate router cache when router methods exist', async () => {
            // Set MION_COMPILE=true so methods get persisted
            const originalCompile = process.env.MION_COMPILE;
            process.env.MION_COMPILE = 'true';

            try {
                // Reset to clean state
                resetRouter();
                resetPersistedMethods();

                // Create some test routes
                const testRoutes = {
                    sayHello: route(() => 'Hello World'),
                    getUser: route((id: string) => ({id, name: 'Test User'})),
                };

                // Initialize router and register routes to create persisted methods
                initRouter();
                registerRoutes(testRoutes);

                // Verify that methods were persisted
                const persistedMethods = getPersistedMethods();
                expect(Object.keys(persistedMethods).length).toBeGreaterThan(0);

                // Now generate caches - should include router cache
                const result = await generateAOTCaches({
                    outputDir: testOutputDir,
                    generateRouter: true,
                    generateJitFunctions: false,
                    generatePureFunctions: false,
                    verbose: true,
                });

                // Debug: log the result to see what went wrong
                if (!result.success) {
                    console.log('Generation failed. Errors:', result.errors);
                    console.log('Warnings:', result.warnings);
                }

                expect(result.success).toBe(true);
                expect(result.errors).toHaveLength(0);

                // Should have generated router cache file
                expect(result.generatedFiles.length).toBeGreaterThan(0);
                const routerCacheFile = result.generatedFiles.find((f) => f.includes('router.cache'));
                expect(routerCacheFile).toBeDefined();
                expect(existsSync(routerCacheFile!)).toBe(true);

                // Should not have warnings about missing router methods
                expect(result.warnings.some((w) => w.includes('No router methods found'))).toBe(false);
            } finally {
                // Restore original environment variable
                if (originalCompile !== undefined) {
                    process.env.MION_COMPILE = originalCompile;
                } else {
                    delete process.env.MION_COMPILE;
                }
            }
        });
    });
});
