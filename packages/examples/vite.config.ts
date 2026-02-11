import {defineConfig} from 'vite';
import {resolve} from 'path';
import {deepkitType} from '@deepkit/vite';

export default defineConfig({
    plugins: [
        deepkitType({
            tsConfig: resolve(__dirname, 'tsconfig.json'),
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
                '@mionkit/core',
                '@mionkit/router',
                '@mionkit/node',
                '@mionkit/aws',
                '@mionkit/bun',
                '@mionkit/gcloud',
                '@mionkit/client',
                '@mionkit/type-formats',
                '@mionkit/run-types',
                /^node:/,
            ],
        },
    },
});
