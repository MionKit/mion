import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The plugin is required here, unlike the other test-only projects: the suite declares its own
// fixture routes, and without the build-time type information every one fails with MissingRtFnsError.
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
