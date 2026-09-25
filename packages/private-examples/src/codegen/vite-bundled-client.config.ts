import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      bundleApi: 'bundled',
      api: {tsConfig: resolve(__dirname, '../api/tsconfig.json')},
    }),
  ],
});
