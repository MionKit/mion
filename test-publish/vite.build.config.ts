import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
            aotCaches: {
                cache: true,
            },
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, 'src/client'),
            },
            server: {
                startServerScript: resolve(__dirname, 'src/server/server.ts'),
                serverViteConfig: resolve(__dirname, 'vite.server.config.ts'),
                mode: 'onlyAOT',
            },
        }) as any,
    ],
    build: {
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        lib: {
            entry: resolve(__dirname, 'src/server/server.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            output: {
                format: 'es',
                entryFileNames: '[name].js',
            },
            external: [/^@mionjs\//, /^[^./]/],
        },
    },
});
