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
});
