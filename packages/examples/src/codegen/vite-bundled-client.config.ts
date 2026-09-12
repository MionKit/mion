import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// A client that ships its API: every route it calls is compiled into the bundle, and api.tsConfig
// resolves those routes in the API project.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      bundleApi: 'bundled',
      api: {tsConfig: resolve(__dirname, '../api/tsconfig.json')},
    }),
  ],
});
