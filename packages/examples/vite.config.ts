import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {
                tsConfig: resolve(__dirname, 'tsconfig.json'),
            },
        }),
    ],
    build: {
        outDir: '.dist',
        emptyOutDir: true,
        minify: false,
        rollupOptions: {
            input: {
                'serve-node': resolve(__dirname, 'src/serve-node.ts'),
                'serve-bun': resolve(__dirname, 'src/serve-bun.ts'),
                'serve-aws-lambda': resolve(__dirname, 'src/serve-aws-lambda.ts'),
                'serve-google-cf': resolve(__dirname, 'src/serve-google-cf.ts'),
            },
            output: {
                dir: '.dist',
                format: 'es',
                entryFileNames: '[name].js',
            },
            external: [
                '@mionjs/core',
                '@mionjs/router',
                '@mionjs/platform-node',
                '@mionjs/platform-aws',
                '@mionjs/platform-bun',
                '@mionjs/platform-gcloud',
                '@mionjs/client',
                '@mionjs/type-formats',
                '@mionjs/run-types',
                /^node:/,
            ],
        },
    },
});
