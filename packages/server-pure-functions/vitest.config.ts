import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
    plugins: [
        deepkitType({
            tsConfig: resolve(__dirname, 'tsconfig.json'),
            compilerOptions: {
                sourceMap: true,
            },
        }) as any,
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts', 'e2e-test/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['node_modules/', '.dist/', 'e2e-test/'],
        },
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
            '@mionkit/core': resolve(__dirname, '../core/index.ts'),
            '@mionkit/server-pure-functions': resolve(__dirname, '.'),
        },
    },
});
