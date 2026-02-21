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
        include: ['src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
    resolve: {
        alias: {
            '@mionkit/run-types': resolve(__dirname, '.'),
            '@mionkit/core': resolve(__dirname, '../core'),
        },
    },
});
