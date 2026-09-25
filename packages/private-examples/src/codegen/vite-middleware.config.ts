import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      server: {
        // loaded through Vite's SSR pipeline (`ssrLoadModule`), so the same plugin transforms it
        startScript: resolve(__dirname, '../server/src/init.ts'),
        // optional, defaults to the router's own `basePath`
        basePath: '/api',
        // optional, reloads the API when its sources change (default true)
        hotReload: true,
      },
    }),
  ],
});
