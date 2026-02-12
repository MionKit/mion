import {defineConfig} from 'vitest/config';
import {resolve} from 'path';

export default defineConfig({
    test: {
        environment: 'node',
        // Run tests from the src folder (TypeScript files)
        include: ['src/**/*.spec.ts'],
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
            '@mionkit/core': resolve(__dirname, '../core'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
            '@mionkit/router': resolve(__dirname, '../router'),
            '@mionkit/node': resolve(__dirname, '../node'),
            '@mionkit/client': resolve(__dirname, '../client'),
            '@mionkit/test-server': resolve(__dirname, '../test-server'),
            '@mionkit/http': resolve(__dirname, '../http'),
            '@mionkit/aws': resolve(__dirname, '../aws'),
            '@mionkit/gcloud': resolve(__dirname, '../gcloud'),
            '@mionkit/codegen': resolve(__dirname, '../codegen'),
            '@mionkit/bun': resolve(__dirname, '../bun'),
        },
    },
});
