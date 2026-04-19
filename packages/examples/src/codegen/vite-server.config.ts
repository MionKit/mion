import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionVitePlugin({
            // runTypes metadata
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            // Scan client source for pureServerFn() and mapFrom() calls
            serverPureFunctions: {
                clientSrcPath: resolve(__dirname, '../client/src'),
            },
        }),
    ],
    build: {
        lib: {
            entry: resolve(__dirname, 'src/init.ts'),
            formats: ['es'],
        },
        rollupOptions: {
            external: [/^[^./]/],
        },
    },
});
