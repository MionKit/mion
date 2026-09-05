import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Client build config. Batches need nothing here: the API's own build reads every `batch([...])`
// and inline inputFrom mapper out of this project (its config names this tsconfig with
// `client.tsConfig`) and generates what it needs itself. The `server` block is a dev and test
// convenience only: spawn the API as a child process and poll its port until it accepts
// connections (await `serverReady`), so client tests hit a live API.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      server: {
        startScript: resolve(__dirname, '../server/src/init.ts'),
        viteConfig: resolve(__dirname, '../server/vite.config.ts'),
        runMode: 'childProcess',
        waitTimeout: 30000,
        env: {PORT: '3000'},
      },
    }),
  ],
});
