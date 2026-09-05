import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// Client build config. Batches need no option: every `batch([...])` this build reads (and its
// inline inputFrom mappers) is written as `.mion/rpc/batches.generated.js` into the server root,
// and the server build imports it by itself. The `server` block names that root.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      // The mion API this client talks to. For a separate server project the two paths say where
      // the batch module goes; the rest is optional (dev/e2e only): spawn the server as a child
      // process and poll its port until it accepts connections (await `serverReady`), so client
      // tests hit a live API.
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
