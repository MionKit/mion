import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionkit/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            aotCaches: {
                mode: 'client',
                startServerScript: resolve(__dirname, '../router/src/defaultRoutes.ts'),
                serverViteConfig: resolve(__dirname, '../router/vite.config.ts'),
            },
        }) as any,
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        globalSetup: './globalSetup.ts',
        // Prevent test-server from auto-starting when imported
        env: {
            MION_TEST_SERVER_AUTO_START: 'false',
        },
        // Run tests sequentially to avoid conflicts with shared server
        pool: 'forks',
        poolOptions: {
            forks: {
                singleFork: true,
            },
        },
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
    resolve: {
        alias: {
            '@mionkit/client': resolve(__dirname, '.'),
            '@mionkit/core': resolve(__dirname, '../core'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
            '@mionkit/router': resolve(__dirname, '../router'),
            '@mionkit/node': resolve(__dirname, '../node'),
            '@mionkit/test-server': resolve(__dirname, '../test-server'),
        },
    },
});
