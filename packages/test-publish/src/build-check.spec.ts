/* ########
 * 2025 mion
 * Author: Ma-jerez
 * License: MIT
 * The software is provided "as is", without warranty of any kind.
 * ######## */

import {describe, it, expect} from 'vitest';
import {resolve} from 'path';
import {existsSync} from 'fs';

/**
 * Pre-flight check to ensure all required packages are built before running tests.
 * This test runs first and fails fast if any package is missing its build artifacts.
 */
describe('Build Verification', () => {
    const packagesDir = resolve(__dirname, '../../');

    /** List of packages that must be built before running test-publish tests */
    const requiredPackages = [
        'core',
        'run-types',
        'type-formats',
        'router',
        'node',
        'client',
        'test-server',
        'http',
        'aws',
        'gcloud',
        'codegen',
        'bun',
    ];

    it('should verify all required packages are built', () => {
        const missingBuilds: string[] = [];

        for (const pkg of requiredPackages) {
            const esmPath = resolve(packagesDir, pkg, '.dist/esm/index.js');
            const cjsPath = resolve(packagesDir, pkg, '.dist/cjs/index.js');
            const esmTypesPath = resolve(packagesDir, pkg, '.dist/esm/index.d.ts');

            // Check if ESM build exists
            if (!existsSync(esmPath)) {
                missingBuilds.push(`${pkg}/.dist/esm/index.js`);
            }

            // Check if CJS build exists
            if (!existsSync(cjsPath)) {
                missingBuilds.push(`${pkg}/.dist/cjs/index.js`);
            }

            // Check if type definitions exist
            if (!existsSync(esmTypesPath)) {
                missingBuilds.push(`${pkg}/.dist/esm/index.d.ts`);
            }
        }

        if (missingBuilds.length > 0) {
            const errorMessage = [
                '',
                '╔══════════════════════════════════════════════════════════════════════════════╗',
                '║                    MISSING BUILD ARTIFACTS DETECTED                          ║',
                '╠══════════════════════════════════════════════════════════════════════════════╣',
                '║ The following packages are missing their build artifacts:                    ║',
                '',
                ...missingBuilds.map((p) => `║   ❌ ${p.padEnd(66)} ║`),
                '',
                '║ Please build all packages before running test-publish tests:                 ║',
                '║                                                                              ║',
                '║   npm run build                                                              ║',
                '║                                                                              ║',
                '║ Or from the monorepo root:                                                   ║',
                '║                                                                              ║',
                '║   npm run build -w @mionkit/core && npm run build -w @mionkit/run-types ...  ║',
                '║                                                                              ║',
                '╚══════════════════════════════════════════════════════════════════════════════╝',
                '',
            ].join('\n');

            throw new Error(errorMessage);
        }

        // If we get here, all builds are present
        expect(missingBuilds).toHaveLength(0);
    });

    it('should verify test-server package has required entry points', () => {
        const testServerDir = resolve(packagesDir, 'test-server');

        // Test-server is special - it provides the test server implementations
        const requiredFiles = [
            '.dist/esm/index.js',
            '.dist/esm/test-server-json.js',
            '.dist/esm/test-server-binary.js',
            '.dist/esm/index.d.ts',
        ];

        const missingFiles: string[] = [];

        for (const file of requiredFiles) {
            const filePath = resolve(testServerDir, file);
            if (!existsSync(filePath)) {
                missingFiles.push(`test-server/${file}`);
            }
        }

        if (missingFiles.length > 0) {
            throw new Error(
                [
                    '',
                    '╔══════════════════════════════════════════════════════════════════════════════╗',
                    '║                    TEST-SERVER BUILD INCOMPLETE                              ║',
                    '╠══════════════════════════════════════════════════════════════════════════════╣',
                    '║ The test-server package is missing required files:                           ║',
                    '',
                    ...missingFiles.map((f) => `║   ❌ ${f.padEnd(66)} ║`),
                    '',
                    '║ Please rebuild the test-server package:                                      ║',
                    '║                                                                              ║',
                    '║   npm run build -w @mionkit/test-server                                      ║',
                    '║                                                                              ║',
                    '╚══════════════════════════════════════════════════════════════════════════════╝',
                    '',
                ].join('\n')
            );
        }

        expect(missingFiles).toHaveLength(0);
    });
});
