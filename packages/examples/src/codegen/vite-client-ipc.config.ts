import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionPlugin} from '@mionjs/devtools/vite-plugin';

// IPC mode: spawns the server, generates AOT caches, and keeps the server running.
// Useful during development when the client needs a live server for API calls.
export default defineConfig({
    plugins: [
        mionPlugin({
            runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
            aotCaches: true,
            // runs the server in a child process separate from vite dev server
            server: {
                startServerScript: resolve(__dirname, '../server/src/init.ts'),
                serverViteConfig: resolve(__dirname, '../server/vite.config.ts'),
                mode: 'IPC',
                port: 3000,
            },
        }),
    ],
});
