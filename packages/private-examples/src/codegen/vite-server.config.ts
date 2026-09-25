import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      // the client project this build reads batches from; leave out when it is this project
      client: {tsConfig: resolve(__dirname, '../client/tsconfig.json')},
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
