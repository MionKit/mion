import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The client's bundled lane: the fetched lane's sources and test server (vitest.config.ts) with `bundleApi: true`, in its
// own program and genDir; its server runs in its own process (test/lib/laneServer.ts) so it is the one this program compiled.
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
    // The first entry runs this lane's test server; the second only removes its genDir on teardown
    globalSetup: ['./test/lib/laneServer.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
    maxWorkers: 1,
  },
});
