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
        include: ['src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
    resolve: {
        alias: {
            '@mionkit/node': resolve(__dirname, '.'),
            '@mionkit/core': resolve(__dirname, '../core'),
            '@mionkit/router': resolve(__dirname, '../router'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
            '@mionkit/test-server': resolve(__dirname, '../test-server'),
        },
    },
});
