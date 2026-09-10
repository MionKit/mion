import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  // Browser-first resolution (client runs in browser by default, but also supports Node/SSR)
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  // globalSetup is loaded through vitest's OWN vite environment (`__vitest__`), which inherits the
  // server defaults rather than either block above. Without this the in-process server start below
  // resolves every @mionjs/* to its unbuilt `.dist` entry and the run dies before any test.
  environments: {__vitest__: {resolve: {conditions: ['source']}}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
      // No `server` block: globalSetup.ts starts the API in THIS process. That also makes this
      // program the batch source — it already pulls the test server in through the `source` export
      // condition — so the resolver writes `rpc/` under this package's genDir and appends the
      // table's import to test-server.ts, the module that calls createMionRouter.
    }),
  ],
  test: {
    name: 'client',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // First entry starts and stops the in-process test server; the second is teardown-only and
    // removes the .mion genDir after the run
    globalSetup: ['./globalSetup.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
    // Run tests sequentially to avoid conflicts with shared server
    maxWorkers: 1,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
