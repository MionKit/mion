import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The plugin is required: the suite's own fixture routes fail with MissingRtFnsError without build-time types.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
      },
    }),
  ],
  test: {
    name: 'test-router-fuzz',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // teardown-only: removes the .mion genDir the runtypes transform writes during the run
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    // No MION_TEST_SERVER_AUTO_START: the suite starts the node adapter itself.
  },
});
