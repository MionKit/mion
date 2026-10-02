import {defineConfig} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      // fetch each route's metadata from the server on first use
      client: {routes: 'fetch'},
    }),
  ],
});
