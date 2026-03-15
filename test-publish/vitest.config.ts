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
            'virtual:mion-server-pure-fns': resolve(__dirname, './packages/pure-functions-test/virtual-mion-server-pure-fns.ts'),
        },
    },
});
