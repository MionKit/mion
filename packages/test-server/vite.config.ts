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
            // required so any serverPureFunction defined in the client package
            // will be bundled into this server (check getPureFnResult route)
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
            },
        }) as any,
    ],
    resolve: {
        alias: {
            '@mionkit/test-server': resolve(__dirname, '.'),
            '@mionkit/core': resolve(__dirname, '../core'),
            '@mionkit/router': resolve(__dirname, '../router'),
            '@mionkit/node': resolve(__dirname, '../node'),
            '@mionkit/run-types': resolve(__dirname, '../run-types'),
            '@mionkit/type-formats': resolve(__dirname, '../type-formats'),
        },
    },
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'index.ts'),
                'src/test-server-json': resolve(__dirname, 'src/test-server-json.ts'),
                'src/test-server-binary': resolve(__dirname, 'src/test-server-binary.ts'),
            },
            formats: ['es'],
        },
        outDir: '.dist/esm',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            output: {
                format: 'es',
                entryFileNames: '[name].js',
                preserveModules: true,
                preserveModulesRoot: '.',
            },
            external: ['@mionkit/core', '@mionkit/router', '@mionkit/node', '@mionkit/type-formats', /^[^./]/],
        },
    },
});
