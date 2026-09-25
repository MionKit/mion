import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      server: {
        startScript: resolve(__dirname, '../server/src/init.ts'),
        // opt in to the API bundle; leave it out and `vite build` emits the client half only
        build: {outDir: 'dist-server'},
      },
    }),
  ],
});
