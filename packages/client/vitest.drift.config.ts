import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// A mixed-bundleApi client built against test/drift/apiA.ts; the spec starts servers A, B, C on one port.
// The name is spelled out because the test-batches check reads it from this file as text.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  environments: {__vitest__: {resolve: {conditions: ['source']}}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.drift.json'),
        genDir: resolve(__dirname, '.mion-drift'),
      },
      bundleApi: 'mixed',
    }),
  ],
  test: {
    name: 'client-drift',
    globals: true,
    environment: 'node',
    include: ['test/drift/**/*.spec.ts'],
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    maxWorkers: 1,
    testTimeout: 300_000,
    hookTimeout: 300_000,
  },
});
