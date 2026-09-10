import {defineConfig} from 'vite';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// A client that ships its API. `bundleApi` compiles, for every route this client calls, the same
// validators and serializers the server holds, and bundles them with the call: no metadata request
// on first use, no browser cache, and no code string built at runtime. `api.tsConfig` names the
// project that declares the API, so the route types resolve in the server's own program and the
// client ships the server's exact functions, whatever this project's tsconfig says. Leave it out
// when client and API share one project.
export default defineConfig({
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.json')},
      bundleApi: 'bundled',
      api: {tsConfig: resolve(__dirname, '../api/tsconfig.json')},
    }),
  ],
});
