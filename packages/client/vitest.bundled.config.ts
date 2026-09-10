import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The bundled-lane client project: the same client sources and the same in-process test server as the
// fetched-lane project (vitest.config.ts), built with `bundleApi: 'bundled'`, so every route these
// specs call comes in with its call site. Its own program (tsconfig.bundled.json) and its own genDir
// keep it apart from the other lanes, and its test server runs in a process of its own
// (test/lib/laneServer.ts), so it is the server this program compiled.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  environments: {__vitest__: {resolve: {conditions: ['source']}}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.bundled.json'),
        genDir: resolve(__dirname, '.mion-bundled'),
      },
      bundleApi: 'bundled',
    }),
  ],
  test: {
    name: 'client-bundled',
    globals: true,
    environment: 'node',
    include: ['test/bundled/**/*.spec.ts'],
    // First entry starts and stops this lane's own test server; the second is teardown-only and
    // removes the lane's genDir after the run
    globalSetup: ['./test/lib/laneServer.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
    maxWorkers: 1,
  },
});
