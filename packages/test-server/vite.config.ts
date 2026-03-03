import {defineConfig} from 'vite';
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
            // required so any serverPureFunction defined in the client package
            // will be bundled into this server (check getPureFnResult route)
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
            },
        }) as any,
    ],
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
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
            external: ['@mionkit/core', '@mionkit/router', '@mionkit/platform-node', '@mionkit/type-formats', /^[^./]/],
        },
    },
});
