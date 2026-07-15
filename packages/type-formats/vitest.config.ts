import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                // Example formats (name/city) use unicode `\u…` escapes RE2 can't compile,
                // so build-time mockSample verification (FMT004) is delegated to the JS lint
                // lane. registerFormatPattern still validates samples against the real JS
                // RegExp at module load, so nothing goes unchecked at runtime.
                allowUncheckedPatterns: true,
                compilerOptions: {
                    sourceMap: true,
                },
            },
        }) as any,
    ],
    test: {
        name: 'type-formats',
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts', 'examples/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
});
