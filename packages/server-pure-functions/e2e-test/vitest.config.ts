import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {pureFunctionsPlugin} from '../src/plugin';

export default defineConfig({
    plugins: [
        pureFunctionsPlugin({
            clientSrcPath: resolve(__dirname, 'packages/test-client/src'),
        }),
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['packages/**/*.spec.ts', './*.spec.ts'],
        pool: 'forks',
        isolate: false,
        fileParallelism: false,
        sequence: {
            hooks: 'list',
        },
        minWorkers: 1,
        maxWorkers: 1,
    },
    resolve: {
        alias: {
            '@mionkit/core': resolve(__dirname, '../../core/index.ts'),
            '@mionkit/server-pure-functions': resolve(__dirname, '..'),
        },
    },
});
