import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Fullstack config (Nuxt / SSR / "backend of a frontend"): the mion API runs INSIDE this vite dev
// server. One process, one port, one module graph — the frontend calls `/api/...` on the same origin
// it is served from, with no proxy and no second server to start.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      // harvest the client's inline serverMapFrom mappers for the in-process API to consume
      serverMappers: {emit: resolve(__dirname, '.mion/server-mappers.json')},
      server: {
        // Loaded through vite's own SSR pipeline (`ssrLoadModule`), so it is transformed by
        // the same plugin the app is. The entry needs no changes for this: mion tells the
        // platform adapter to skip listen() before the entry runs.
        startScript: resolve(__dirname, '../server/src/init.ts'),
        // 'middleware' is the default — spelled out here for the example
        runMode: 'middleware',
        // Optional. Defaults to the router's own `basePath`; with no basePath at all mion
        // serves the root and `exclude` decides what still reaches vite.
        basePath: '/api',
        // Optional: re-load the API when its sources change (default true).
        hotReload: true,
      },
    }),
  ],
});
