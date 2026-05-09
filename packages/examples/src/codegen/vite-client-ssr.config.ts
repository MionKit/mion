import {defineConfig} from 'vite';
import {resolve} from 'path';
import vue from '@vitejs/plugin-vue';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

// middleware mode: mion runs in the same Vite process. Used with frameworks like Nuxt
// that run Vite in middlewareMode. API calls are proxied directly to mion's request
// handler — no separate server process.
export default defineConfig({
    plugins: [
        vue(),
        mionVitePlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            server: {
                startScript: resolve(__dirname, '../server/src/init.ts'),
                // The buildStart AOT pre-pass spawns a vite-node child to compile the caches.
                // Point it at the server's vite.config.ts so the mion plugin loads in the child
                // and resolves `virtual:mion-aot/*` (otherwise the child uses an empty default
                // config and can't find the virtual modules).
                viteConfig: resolve(__dirname, '../server/vite.config.ts'),
                runMode: 'middleware',
            },
        }),
    ],
});
