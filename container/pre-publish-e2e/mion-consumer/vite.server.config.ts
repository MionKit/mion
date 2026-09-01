import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Config for the server child vitest.config.ts spawns through vite-node. It CONSUMES
// the manifest the test lane harvested (the plugin generates
// .mion/server-mappers.generated.js and injects the import for us).
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
      serverMappers: {consume: resolve(__dirname, '.mion/server-mappers.json')},
    }),
  ],
});
