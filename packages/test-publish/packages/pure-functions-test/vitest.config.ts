import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {pureFunctionsPlugin} from '@mionjs/devtools';

export default defineConfig({
    plugins: [
        pureFunctionsPlugin({
            clientSrcPath: resolve(__dirname, '../client/src'),
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
        minWorkers: 1,
        maxWorkers: 1,
    },
});
