import {defineConfig} from 'vite';
import {resolve} from 'path';
// Import from source to ensure we use the latest code during development (not stale build artifacts)
import {mionVitePlugin} from '../devtools/src/vite-plugin/index.ts';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
        }) as any,
    ],
    resolve: {
        alias: {
            '@mionjs/test-server': resolve(__dirname, '.'),
            '@mionjs/core': resolve(__dirname, '../core'),
            '@mionjs/router': resolve(__dirname, '../router'),
            '@mionjs/platform-cloudflare': resolve(__dirname, '../platform-cloudflare'),
        },
    },
    build: {
        lib: {
            entry: resolve(__dirname, 'src/test-server-cloudflare.ts'),
            name: 'CloudflareTestServer',
            formats: ['iife'],
            fileName: () => 'test-server-cloudflare.js',
        },
        outDir: 'build',
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: {
                format: 'iife',
                name: 'CloudflareTestServer',
                // Extend globalThis instead of replacing it (important for workerd)
                extend: true,
                // Inline all dynamic imports (IIFE doesn't support code splitting)
                inlineDynamicImports: true,
            },
            // Bundle ALL dependencies — no externals
            external: [],
        },
    },
});
