import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
    esbuild: {
        format: 'esm',
    },
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
        include: ['packages/*/src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['packages/*/src/**'],
        },
    },
    resolve: {
        alias: {
            '@mionkit/core': resolve(__dirname, 'packages/core'),
            '@mionkit/run-types': resolve(__dirname, 'packages/run-types'),
            '@mionkit/type-formats': resolve(__dirname, 'packages/type-formats'),
            '@mionkit/router': resolve(__dirname, 'packages/router'),
            '@mionkit/node': resolve(__dirname, 'packages/node'),
            '@mionkit/client': resolve(__dirname, 'packages/client'),
            '@mionkit/test-server': resolve(__dirname, 'packages/test-server'),
            '@mionkit/http': resolve(__dirname, 'packages/http'),
            '@mionkit/aws': resolve(__dirname, 'packages/aws'),
            '@mionkit/gcloud': resolve(__dirname, 'packages/gcloud'),
            '@mionkit/devtools': resolve(__dirname, 'packages/devtools'),
            '@mionkit/bun': resolve(__dirname, 'packages/bun'),
        },
    },
});
