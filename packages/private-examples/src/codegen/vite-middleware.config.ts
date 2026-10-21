import {defineConfig} from 'vite';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      server: {
        // loaded through Vite's SSR pipeline (`ssrLoadModule`), so the same plugin transforms it
        entry: 'src/server.ts',
        // optional, reloads the API when its sources change (default true)
        hotReload: true,
      },
    }),
  ],
});
