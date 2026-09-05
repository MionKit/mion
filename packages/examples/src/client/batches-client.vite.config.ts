import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    // Write the batches (and their inline inputFrom mappers) into a manifest
    mionVitePlugin({
      batches: {emit: resolve(__dirname, '.mion/batches.json')},
    }),
  ],
});
