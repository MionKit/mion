import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    // Consume (compile in) the batches the client build wrote
    mionVitePlugin({
      batches: {
        consume: resolve(__dirname, '../client/.mion/batches.json'),
      },
    }),
  ],
});
