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
                // failOnError defaults to false in mionVitePlugin (see its comment): this
                // adapter's pure-fn helpers wrap ts-runtypes marker APIs with runtime keys,
                // producing expected non-fatal CTA003/PFN001 diagnostics.
                compilerOptions: {
                    sourceMap: true,
                },
            },
        }) as any,
    ],
    test: {
        name: 'run-types',
        globals: true,
        environment: 'node',
        include: ['src/**/*.spec.ts'],
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html'],
            include: ['src/**'],
        },
    },
});
