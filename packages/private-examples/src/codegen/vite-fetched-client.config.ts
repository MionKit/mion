import {defineConfig} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      // every route's metadata and compiled functions come from the server on first use
      client: {routes: 'fetch'},
    }),
  ],
});
