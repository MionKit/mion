import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionPlugin} from '@mionkit/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
        }) as any,
    ],
    test: {
        name: 'router',
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
        env: {
            // Prevent test-server modules from auto-starting servers when imported
            MION_TEST_SERVER_AUTO_START: 'false',
        },
    },
    resolve: {
        alias: {
            '@mionkit/router': resolve(__dirname, '.'),
            '@mionkit/core': resolve(__dirname, '../core'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
            '@mionkit/test-server': resolve(__dirname, '../test-server'),
            '@mionkit/node': resolve(__dirname, '../node'),
        },
    },
});
