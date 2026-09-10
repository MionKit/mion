import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// One config, two bundles: `vite build` emits the client static files (dist/) AND the API
// (dist-server/), from one program and one resolver. In `vite dev` the same `server` block mounts
// the API inside the dev server, so the frontend calls `/api/...` on the origin it is served from.
// Batches need nothing: client and API are one program, so this build generates the batch table
// and the API imports it.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      server: {
        startScript: resolve(__dirname, '../server/src/init.ts'),
        // Opt in to the server bundle. Leave it out and `vite build` emits the client half only.
        build: {outDir: 'dist-server'},
      },
    }),
  ],
});
