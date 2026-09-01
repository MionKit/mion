import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    // Consume (bake in) the mappers the client build harvested
    mionVitePlugin({
      serverMappers: {consume: resolve(__dirname, '../client/.mion/server-mappers.json')},
    }),
  ],
});
