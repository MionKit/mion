import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite-plugin';

// Client build config. Two independent concerns:
export default defineConfig({
    plugins: [
        mionVitePlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            // 1. serverMappers.emit — harvest the inline serverMapFrom mappers this client build
            //    contains into a manifest the server build consumes. This is the core client<->server
            //    transport (route validation/serialization metadata itself comes from the router
            //    types at build time — no server needed for that).
            serverMappers: {emit: resolve(__dirname, '.mion/server-mappers.json')},
            // 2. server (optional, e2e/dev only) — spawn the mion server as a child process and poll
            //    its port until it accepts connections (await `serverReady`), so client tests hit a
            //    live API. Only 'childProcess' mode exists.
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
