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
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts', 'examples/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
    resolve: {
        alias: {
            '@mionkit/type-formats': resolve(__dirname, '.'),
            '@mionkit/type-formats/FormatsString': resolve(__dirname, 'FormatsString.ts'),
            '@mionkit/type-formats/FormatsNumber': resolve(__dirname, 'FormatsNumber.ts'),
            '@mionkit/type-formats/FormatsBigint': resolve(__dirname, 'FormatsBigint.ts'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/core': resolve(__dirname, '../core'),
        },
    },
});
