import {defineConfig} from 'vite';
import {resolve} from 'path';
// Import from source to ensure we use the latest code during development (not stale build artifacts)
import {mionPlugin} from '../devtools/src/vite-plugin/index.ts';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
            },
            aotCaches: {
                cache: false, // Disable disk caching for test builds
                excludeReflection: true,
            },
            server: {
                startScript: resolve(__dirname, 'src/test-server-cloudflare.ts'),
                viteConfig: resolve(__dirname, 'vite.cloudflare.config.ts'),
                runMode: 'buildOnly',
            },
        }) as any,
    ],
    resolve: {
        alias: {
            '@mionjs/test-server': resolve(__dirname, '.'),
            '@mionjs/core': resolve(__dirname, '../core'),
            '@mionjs/router': resolve(__dirname, '../router'),
            '@mionjs/platform-cloudflare': resolve(__dirname, '../platform-cloudflare'),
            '@mionjs/type-formats': resolve(__dirname, '../type-formats'),
            // Aliases needed for AOT child process (dev: packages aren't built).
            // During bundle build, the plugin stubs these before aliases are reached.
            '@mionjs/run-types': resolve(__dirname, '../run-types'),
            '@deepkit/type': resolve(__dirname, '../../node_modules/@deepkit/type'),
            '@deepkit/core': resolve(__dirname, '../../node_modules/@deepkit/core'),
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
