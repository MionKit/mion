import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionkit/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
        }),
    ],
    build: {
        lib: {entry: resolve(__dirname, 'src/vercel-serverless.ts'), formats: ['es']},
        outDir: 'dist',
        emptyOutDir: true,
        sourcemap: true,
        minify: false,
        rollupOptions: {
            external: [/^@mionkit\//, /^[^./]/],
            output: {format: 'es', entryFileNames: '[name].js'},
        },
    },
});
