import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// vitest.config.ts's sources and test server with `bundleApi: true`, in their own program and genDir; the server
// runs in its own process (test/lib/laneServer.ts) so it is the one this program compiled.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  environments: {__vitest__: {resolve: {conditions: ['source']}}},
  plugins: [
    mionVitePlugin({
      runTypes: {tsConfig: resolve(__dirname, 'tsconfig.bundled.json'), genDir: resolve(__dirname, '.mion-bundled')},
      bundleApi: true,
    }),
  ],
  test: {
    // Spelled out: the test-batches check reads the name from this file as text.
    name: 'client-bundled',
    globals: true,
    environment: 'node',
    include: ['test/bundled/**/*.spec.ts'],
    globalSetup: ['./test/lib/laneServer.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
    maxWorkers: 1,
  },
});
