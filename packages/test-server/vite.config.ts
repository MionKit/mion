import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
                compilerOptions: {
                    sourceMap: true,
                },
            },
            // consume the client build's harvested serverMapFrom mappers (registered via
            // the virtual:mion/server-mappers side-effect import in test-server.ts)
            serverMappers: {consume: resolve(__dirname, '../client/.mion/server-mappers.json')},
        }) as any,
    ],
    resolve: {conditions: ['source']},
    ssr: {resolve: {conditions: ['source']}},
    build: {
        lib: {
            entry: {
                index: resolve(__dirname, 'index.ts'),
                'src/test-server-json': resolve(__dirname, 'src/test-server.ts'),
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
            external: ['@mionjs/core', '@mionjs/router', '@mionjs/platform-node', '@mionjs/type-formats', /^[^./]/],
        },
    },
});
