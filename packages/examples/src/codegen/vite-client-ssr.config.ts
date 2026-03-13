import {defineConfig} from 'vite';
import {resolve} from 'path';
import vue from '@vitejs/plugin-vue';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

// viteSSR mode: loads the server in the same Vite process.
// Used with frameworks like Nuxt that run Vite in middlewareMode.
export default defineConfig({
    plugins: [
        vue(),
        mionPlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            // run mion ins the same dev server as FE but in SSR mode
            // mion runs as a middleware function
            // api calls are directly proxied to the mion request handler function
            server: {
                startServerScript: resolve(__dirname, '../server/src/init.ts'),
                mode: 'viteSSR',
            },
        }),
    ],
});
