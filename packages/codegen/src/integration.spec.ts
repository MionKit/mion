/* ########
 * 2024 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {generateAOTCaches} from './codegen';
import {rmSync, existsSync} from 'fs';
import {join} from 'path';

describe('AOT Integration Tests', () => {
    const testOutputDir = join(__dirname, '../.dist/integration-test');

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
            console.log('[PRESERVE] Integration test artifacts preserved - skipping final cleanup');
            return;
        }

        // Final cleanup of integration test artifacts
        const integrationArtifactDirs = [
            join(__dirname, '../.dist/integration-test'),
            join(__dirname, '../.dist/missing-dir-test'),
            join(__dirname, '../.dist/temp-test'),
        ];

        for (const dir of integrationArtifactDirs) {
            if (existsSync(dir)) {
                try {
                    rmSync(dir, {recursive: true, force: true});
                } catch {
                    // Silently ignore cleanup failures
                }
            }
        }
    });

    describe('Transparent Architecture', () => {
        it('should demonstrate the transparent workflow', async () => {
            // This test demonstrates that the AOT system works transparently
            // In a real application:
            // 1. User calls registerRoutes() -> router automatically loads caches
            // 2. User calls startServer() with MION_COMPILE=true -> automatically generates caches

            // For this test, we'll just verify cache generation works
            const result = await generateAOTCaches({
                outputDir: testOutputDir,
                verbose: false,
            });

            // Should succeed even with empty caches (just warnings)
            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some((w) => w.includes('No router methods found'))).toBe(true);
        });

        it('should handle missing output directory gracefully', async () => {
            const testDir = join(__dirname, '../.dist/missing-dir-test/cache');
            const result = await generateAOTCaches({
                outputDir: testDir,
                verbose: false,
            });

            // Should create the directory and succeed
            expect(result.success).toBe(true);

            // Clean up the test directory (unless preserving artifacts)
            if (process.env.PRESERVE_TEST_ARTIFACTS !== 'true') {
                const parentDir = join(__dirname, '../.dist/missing-dir-test');
                if (existsSync(parentDir)) {
                    rmSync(parentDir, {recursive: true, force: true});
                }
            } else {
                console.log(`[PRESERVE] Missing dir test artifacts preserved in: ${testDir}`);
            }
        });
    });

    describe('Binary Script Integration', () => {
        it('should have the binary script available', () => {
            const binaryPath = join(__dirname, '../bin/mion-compile.mjs');
            expect(existsSync(binaryPath)).toBe(true);
        });
    });
});
