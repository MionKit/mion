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
        maxWorkers: 1,
        // Global setup/teardown for test servers
        globalSetup: ['./globalSetup.ts'],
    },
    resolve: {
        alias: {
            // Virtual module shims (must be listed before package aliases)
            'virtual:mion-aot/caches': resolve(__dirname, './virtual-mion-aot-caches.ts'),
            'virtual:mion-server-pure-fns': resolve(__dirname, './virtual-mion-server-pure-fns.ts'),
            // All @mionjs/* packages resolve to their built .dist folders
            // This ensures we test the actual published artifacts, not source files
            '@mionjs/client/aot': resolve(__dirname, '../client/.dist/esm/src/aot/loadClientAOTCaches.js'),
            '@mionjs/core': resolve(__dirname, '../core/.dist/esm'),
            '@mionjs/run-types': resolve(__dirname, '../run-types/.dist/esm'),
            '@mionjs/type-formats': resolve(__dirname, '../type-formats/.dist/esm'),
            '@mionjs/router': resolve(__dirname, '../router/.dist/esm'),
            '@mionjs/platform-node': resolve(__dirname, '../platform-node/.dist/esm'),
            '@mionjs/client': resolve(__dirname, '../client/.dist/esm'),
            '@mionjs/test-server': resolve(__dirname, '../test-server/.dist/esm'),
            '@mionjs/platform-aws': resolve(__dirname, '../platform-aws/.dist/esm'),
            '@mionjs/platform-gcloud': resolve(__dirname, '../platform-gcloud/.dist/esm'),
            '@mionjs/devtools': resolve(__dirname, '../devtools/.dist/esm'),
            '@mionjs/platform-bun': resolve(__dirname, '../platform-bun/.dist/esm'),
        },
    },
});
