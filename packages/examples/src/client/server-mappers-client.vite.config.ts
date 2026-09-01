import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    // Harvest the inline serverMapFrom mappers into a manifest
    mionVitePlugin({
      serverMappers: {emit: resolve(__dirname, '.mion/server-mappers.json')},
    }),
  ],
});
