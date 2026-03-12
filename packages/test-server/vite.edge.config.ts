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
            aotCaches: {
                cache: false, // Disable disk caching for test builds
                excludeReflection: true,
            },
            server: {
                startServerScript: resolve(__dirname, 'src/test-server-edge.ts'),
                serverViteConfig: resolve(__dirname, 'vite.edge.config.ts'),
                mode: 'onlyAOT',
            },
        }) as any,
    ],
    resolve: {
        alias: {
            '@mionjs/test-server': resolve(__dirname, '.'),
            '@mionjs/core': resolve(__dirname, '../core'),
            '@mionjs/router': resolve(__dirname, '../router'),
            '@mionjs/platform-vercel': resolve(__dirname, '../platform-vercel'),
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
            entry: resolve(__dirname, 'src/test-server-edge.ts'),
            name: 'EdgeTestServer',
            formats: ['iife'],
            fileName: () => 'test-server-edge.js',
        },
        outDir: 'build',
        emptyOutDir: false,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: {
                format: 'iife',
                name: 'EdgeTestServer',
                // Extend globalThis instead of replacing it (important for EdgeVM)
                extend: true,
                // Inline all dynamic imports (IIFE doesn't support code splitting)
                inlineDynamicImports: true,
            },
            // Bundle ALL dependencies — no externals
            external: [],
        },
    },
});
