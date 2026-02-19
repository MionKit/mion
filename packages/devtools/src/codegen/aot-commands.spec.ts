/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {existsSync, rmSync, readFileSync, writeFileSync, mkdirSync} from 'fs';
import {join, resolve} from 'path';
import {initAOT} from './cli-init-aot.js';
import {buildAOT} from './cli-build-aot.js';

const PACKAGE_ROOT = resolve(__dirname, '..', '..');
const TEMPLATE_DIR = join(PACKAGE_ROOT, 'mion-aot-template');
// ensure artifact dirs is unique and not used by other tests
const TEST_ARTIFACTS_DIR = join(PACKAGE_ROOT, '.dist', 'test-artifacts-commands');

describe('AOT Commands Integration Tests', () => {
    beforeAll(() => {
        // Ensure test artifacts directory exists
        if (!existsSync(TEST_ARTIFACTS_DIR)) {
            mkdirSync(TEST_ARTIFACTS_DIR, {recursive: true});
        }
    });

    afterAll(() => {
        // Clean up all test artifacts
        if (existsSync(TEST_ARTIFACTS_DIR)) {
            try {
                rmSync(TEST_ARTIFACTS_DIR, {recursive: true, force: true});
            } catch (error) {
                console.warn('Cleanup failed:', (error as Error).message);
            }
        }
    });

    describe('initAOT function', () => {
        const testAotDir = join(TEST_ARTIFACTS_DIR, 'test-aot-package');

        afterEach(() => {
            // Clean up after each test
            if (existsSync(testAotDir)) {
                try {
                    rmSync(testAotDir, {recursive: true, force: true});
                } catch (error) {
                    console.warn('Test cleanup failed:', (error as Error).message);
                }
            }
        });

        it('should create AOT package from template with default package name', () => {
            initAOT({
                dir: testAotDir,
                templateDir: TEMPLATE_DIR,
            });

            // Verify directory was created
            expect(existsSync(testAotDir)).toBe(true);

            // Verify package.json was created and updated
            const packageJsonPath = join(testAotDir, 'package.json');
            expect(existsSync(packageJsonPath)).toBe(true);

            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            expect(packageJson.name).toBe('test-aot-package');

            // Verify template files were copied
            expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'jitFns.cache.js'))).toBe(true);
            expect(existsSync(join(testAotDir, 'build', 'esm', 'src', 'jitFns.cache.js'))).toBe(true);
            expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'pureFns.cache.js'))).toBe(true);
            expect(existsSync(join(testAotDir, 'build', 'cjs', 'src', 'router.cache.js'))).toBe(true);
        });

        it('should create AOT package with custom package name', () => {
            initAOT({
                dir: testAotDir,
                packageName: 'my-custom-aot',
                templateDir: TEMPLATE_DIR,
            });

            // Verify package.json has custom name
            const packageJsonPath = join(testAotDir, 'package.json');
            const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
            expect(packageJson.name).toBe('my-custom-aot');
        });

        it('should fail when target directory already exists and is not a mion AOT template', () => {
            // Create directory with non-AOT package.json
            mkdirSync(testAotDir, {recursive: true});
            writeFileSync(
                join(testAotDir, 'package.json'),
                JSON.stringify(
                    {
                        name: 'some-other-package',
                        version: '1.0.0',
                    },
                    null,
                    2
                )
            );

            expect(() => {
                initAOT({
                    dir: testAotDir,
                    templateDir: TEMPLATE_DIR,
                });
            }).toThrow('already exists and is not a mion AOT template');
        });

        it('should update existing mion AOT template when directory exists', () => {
            // Create initial AOT package
            initAOT({
                dir: testAotDir,
                templateDir: TEMPLATE_DIR,
            });

            // Verify it was created
            expect(existsSync(testAotDir)).toBe(true);
            const initialPackageJson = JSON.parse(readFileSync(join(testAotDir, 'package.json'), 'utf8'));
            expect(initialPackageJson.isMionAOT).toBe(true);

            // Run init again - should update instead of failing
            expect(() => {
                initAOT({
                    dir: testAotDir,
                    packageName: 'updated-aot-package',
                    templateDir: TEMPLATE_DIR,
                });
            }).not.toThrow();

            // Verify it was updated
            const updatedPackageJson = JSON.parse(readFileSync(join(testAotDir, 'package.json'), 'utf8'));
            expect(updatedPackageJson.name).toBe('updated-aot-package');
            expect(updatedPackageJson.isMionAOT).toBe(true);
        });

        it('should exclude src folder from copied template', () => {
            initAOT({
                dir: testAotDir,
                templateDir: TEMPLATE_DIR,
            });

            // Verify src folder was excluded from the copy
            expect(existsSync(join(testAotDir, 'src'))).toBe(false);

            // Verify build folders still exist
            expect(existsSync(join(testAotDir, 'build', 'cjs', 'src'))).toBe(true);
            expect(existsSync(join(testAotDir, 'build', 'esm', 'src'))).toBe(true);
        });
    });

    describe('buildAOT function', () => {
        const testAotDir = join(TEST_ARTIFACTS_DIR, 'build-test-aot');
        const mockStartScript = join(TEST_ARTIFACTS_DIR, 'mock-start-script.mjs');

        beforeEach(() => {
            // Clean up first to ensure fresh state
            if (existsSync(testAotDir)) {
                rmSync(testAotDir, {recursive: true, force: true});
            }

            // Create AOT package first
            initAOT({
                dir: testAotDir,
                templateDir: TEMPLATE_DIR,
            });

            // Create a mock start script that simulates MION_COMPILE behavior
            const mockScriptContent = `
// Mock start script for testing
console.log('Mock server starting...');

// Simulate MION_COMPILE behavior
if (process.env.MION_COMPILE === 'true') {
    console.log('MION_COMPILE=true detected, populating caches...');

    // Mock cache population - in real scenario, this would be done by the actual server
    // For testing, we'll just simulate that caches are populated
    console.log('Caches populated, server not starting');
    process.exit(0);
} else {
    console.log('Starting server normally...');
    // In real scenario, server would start here
}
`;
            writeFileSync(mockStartScript, mockScriptContent, 'utf8');
        });

        afterEach(() => {
            // Clean up after each test
            if (existsSync(testAotDir)) {
                rmSync(testAotDir, {recursive: true, force: true});
            }
            if (existsSync(mockStartScript)) {
                rmSync(mockStartScript, {force: true});
            }
        });

        it('should fail when AOT directory does not exist', async () => {
            const nonExistentDir = resolve(join(TEST_ARTIFACTS_DIR, 'non-existent'));

            await expect(
                buildAOT({
                    aotDir: nonExistentDir,
                    startScript: resolve(mockStartScript),
                })
            ).rejects.toThrow('AOT directory does not exist');
        });

        it('should fail when start script does not exist', async () => {
            const nonExistentScript = resolve(join(TEST_ARTIFACTS_DIR, 'non-existent-script.js'));

            await expect(
                buildAOT({
                    aotDir: resolve(testAotDir),
                    startScript: nonExistentScript,
                })
            ).rejects.toThrow('Start script does not exist');
        });

        it('should fail when AOT package has not been built', async () => {
            // Remove build directories to simulate unbuild package
            rmSync(join(testAotDir, 'build'), {recursive: true, force: true});

            await expect(
                buildAOT({
                    aotDir: resolve(testAotDir),
                    startScript: resolve(mockStartScript),
                })
            ).rejects.toThrow('AOT package has not been built');
        });
    });
});
