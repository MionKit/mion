import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [mionVitePlugin()],
  build: {
    lib: {
      entry: resolve(__dirname, 'src/server.ts'),
      formats: ['es'],
    },
    rollupOptions: {
      external: [/^[^./]/],
    },
  },
});
