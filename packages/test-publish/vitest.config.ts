import {defineConfig} from 'vitest/config';
import {resolve} from 'path';

/**
 * Vitest configuration for test-publish package.
 * This is a special configuration that runs tests against BUILT packages only.
 * Tests are written in TypeScript but vitest handles them natively without
 * needing to transform the imported packages (which are already built).
 */
export default defineConfig({
    test: {
        environment: 'node',
        // Run tests from the packages/modules/src folder (TypeScript files)
        // But imports resolve to built .dist folders (no ts transformation)
        include: ['packages/modules/src/**/*.spec.ts'],
        // Longer timeouts for build tests since they test actual server/client interactions
        testTimeout: 30000,
        // Run tests sequentially to avoid port conflicts
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        // Global setup/teardown for test servers
        globalSetup: ['./globalSetup.ts'],
    },
    resolve: {
        alias: {
            // All @mionkit/* packages resolve to their built .dist folders
            // This ensures we test the actual published artifacts, not source files
            '@mionkit/core': resolve(__dirname, '../core/.dist/esm'),
            '@mionkit/run-types': resolve(__dirname, '../run-types/.dist/esm'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats/.dist/esm'),
            '@mionkit/router': resolve(__dirname, '../router/.dist/esm'),
            '@mionkit/node': resolve(__dirname, '../node/.dist/esm'),
            '@mionkit/client': resolve(__dirname, '../client/.dist/esm'),
            '@mionkit/test-server': resolve(__dirname, '../test-server/.dist/esm'),
            '@mionkit/aws': resolve(__dirname, '../aws/.dist/esm'),
            '@mionkit/gcloud': resolve(__dirname, '../gcloud/.dist/esm'),
            '@mionkit/codegen': resolve(__dirname, '../codegen/.dist/esm'),
            '@mionkit/bun': resolve(__dirname, '../bun/.dist/esm'),
        },
    },
});
