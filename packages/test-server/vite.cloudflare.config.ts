import {defineConfig} from 'vite';
import {resolve} from 'path';
// Import from source to ensure we use the latest code during development (not stale build artifacts)
import {mionVitePlugin} from '../devtools/src/vite-plugin/index.ts';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                // 'both' is REQUIRED for edge targets. The default 'code' ships each compiled fn
                // as a source STRING that @ts-runtypes/core materializes with `new Function` on
                // first use — and workerd / Vercel's EdgeVM refuse that ("Code generation from
                // strings disallowed for this context"), so initMionRouter dies on the very first
                // route. 'both' also emits the live factory, so nothing is compiled at runtime;
                // the code string stays in the bundle because the methods-metadata route
                // serializes it to mion clients.
                emitMode: 'both',
                // own genDir: the node lib build (vite.config.ts) and the two bundle builds share this
                // package, and they DISAGREE on emitMode. One `__runtypes` for all three means the last
                // writer wins — and when they run concurrently (vitest workspace) the bundle gets rolled
                // up against another build's generated modules.
                // NOT nested under `__runtypes`: that dir IS the node build's genDir, and RunTypes
                // refuses to generate into a genDir holding entries it did not write.
                genDir: resolve(__dirname, '__runtypes-cloudflare'),
            },
        }),
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
