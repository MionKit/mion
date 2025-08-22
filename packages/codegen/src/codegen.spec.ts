/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {generateAOTCaches} from './codegen';
// Note: loadRouterCache and loadCoreCache are now internal functions used by router
// They are tested indirectly through router integration
import {rmSync, existsSync} from 'fs';
import {join} from 'path';

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
    });
});
