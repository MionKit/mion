import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      // Compile in the batches (and their inline inputFrom mappers) the CLIENT build wrote into this manifest.
      batches: {
        consume: resolve(__dirname, '../client/.mion/batches.json'),
      },
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/init.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^[^./]/],
    },
  },
});
