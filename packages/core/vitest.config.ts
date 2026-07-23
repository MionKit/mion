import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    plugins: [
        // Needed by src/runtypes/* specs + the errors.ts class-serializer registration call site:
        // the @ts-runtypes/devtools plugin injects the marker payloads at build time.
        // failOnError defaults to false in mionVitePlugin (see its comment): the adapter's
        // pure-fn helpers wrap ts-runtypes marker APIs with runtime keys, producing expected
        // non-fatal CTA003/PFN001 diagnostics.
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
        }) as any,
    ],
    test: {
        name: 'core',
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
