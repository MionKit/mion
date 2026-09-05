import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Config for the server child vitest.config.ts spawns through vite-node. Nothing to
// configure for batches: the test lane wrote .mion/rpc/batches.generated.js into this
// root and the plugin injects the import for us.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
    }),
  ],
});
