import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
            },
            runTypes: {
                tsConfig: resolve(__dirname, '../../tsconfig.json'),
            },
        }) as any,
    ],
    test: {
        globals: true,
        environment: 'node',
        include: ['**/*.spec.ts'],
        pool: 'forks',
        isolate: false,
        fileParallelism: false,
        sequence: {
            hooks: 'list',
        },
        maxWorkers: 1,
    },
});
