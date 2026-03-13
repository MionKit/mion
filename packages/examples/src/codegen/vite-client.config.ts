import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            aotCaches: {cache: true},
            // Starts a router to emit AOT caches and then process dies
            // server never actually start listening
            server: {
                startServerScript: resolve(__dirname, '../server/src/init.ts'),
                serverViteConfig: resolve(__dirname, '../server/vite.config.ts'),
                mode: 'onlyAOT',
            },
        }),
    ],
});
