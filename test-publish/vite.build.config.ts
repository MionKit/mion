import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
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
                startScript: resolve(__dirname, 'src/server/server.ts'),
                viteConfig: resolve(__dirname, 'vite.server.config.ts'),
                runMode: 'buildOnly',
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
