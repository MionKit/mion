import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

// childProcess mode: the plugin spawns the mion server in a separate process and waits until it
// is ready, so the client dev server has a live API to call. (childProcess is the supported mode.)
export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            // The CLIENT build harvests inline serverMapFrom mappers into this manifest.
            serverMappers: {emit: resolve(__dirname, '.mion/server-mappers.json')},
            server: {
                startScript: resolve(__dirname, '../server/src/init.ts'),
                viteConfig: resolve(__dirname, '../server/vite.config.ts'),
                runMode: 'childProcess',
                waitTimeout: 30000,
                env: {PORT: '3000'},
            },
        }) as any,
    ],
});
