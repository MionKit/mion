/* ########
 * 2022 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {loadAOTCaches, generateAOTCaches} from './codegen';

describe('AOT Cache System', () => {
    describe('loadAOTCaches', () => {
        it('should skip loading when cache directory does not exist', async () => {
            const result = await loadAOTCaches({
                baseDir: './non-existent-dir',
                verbose: false,
            });

            expect(result.skipped).toBe(true);
            expect(result.loaded).toBe(false);
            expect(result.skipReason).toContain('Cache directory not found');
            expect(result.loadedFiles).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should skip loading when disabled', async () => {
            const result = await loadAOTCaches({
                enabled: false,
                verbose: false,
            });

            expect(result.skipped).toBe(true);
            expect(result.loaded).toBe(false);
            expect(result.skipReason).toBe('Cache loading disabled');
            expect(result.loadedFiles).toHaveLength(0);
            expect(result.errors).toHaveLength(0);
        });

        it('should handle missing cache files gracefully', async () => {
            const result = await loadAOTCaches({
                baseDir: './src', // Directory exists but no cache files
                verbose: false,
            });

            expect(result.skipped).toBe(false);
            expect(result.loaded).toBe(false);
            expect(result.loadedFiles).toHaveLength(0);
            // Should not have errors, just no files found
        });
    });

    describe('generateAOTCaches', () => {
        it('should handle empty caches gracefully', async () => {
            const result = await generateAOTCaches({
                outputDir: './test-cache',
                verbose: false,
            });

            // Should succeed but with warnings about empty caches
            expect(result.success).toBe(true);
            expect(result.warnings.length).toBeGreaterThan(0);
            expect(result.warnings.some((w) => w.includes('No router methods found'))).toBe(true);
        });

        it('should create output directory if it does not exist', async () => {
            const result = await generateAOTCaches({
                outputDir: './test-cache-new',
                generateRouter: false,
                generateJitFunctions: false,
                generatePureFunctions: false,
                verbose: false,
            });

            expect(result.success).toBe(true);
            expect(result.generatedFiles).toHaveLength(0);
        });
    });
});
