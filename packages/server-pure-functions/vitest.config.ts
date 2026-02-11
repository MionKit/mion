import {defineConfig} from 'vitest/config';
import {resolve} from 'path';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts', 'e2e-test/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            exclude: ['node_modules/', '.dist/', 'e2e-test/'],
        },
        deps: {
            interopDefault: true,
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
        },
    },
    // Use esm interop to handle CJS/ESM issues
    esbuild: {
        target: 'node18',
    },
});
