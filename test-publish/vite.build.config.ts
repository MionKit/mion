import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
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
