import {defineConfig} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      // one tsconfig for client and server code (the default)
      tsConfig: 'tsconfig.json',
      server: {
        entry: 'src/server.ts',
        // opt in to the API bundle; leave it out and `vite build` emits the client half only
        build: {outDir: 'dist-server'},
      },
    }),
  ],
});
