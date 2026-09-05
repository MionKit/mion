import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Server build config. Nothing to configure for batches: the client build wrote
// `.mion/rpc/batches.generated.js` into this root, and the plugin imports it from the module
// that calls createMionRouter.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
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
