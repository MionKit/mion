import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from './src/mion/index.ts';

export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    mionVitePlugin({
      runTypes: {
        tsConfig: resolve(__dirname, 'tsconfig.json'),
        // Deliberately not the upstream default: patternSidecar.spec.ts asserts the
        // generated pool is exactly this many, which only proves the passthrough works
        // if the number is distinctive. Keep it in sync with EXPECTED_SAMPLE_COUNT there
        // — on drift that spec fails, which is the point.
        patternSampleCount: 7,
      },
    }),
  ],
  test: {
    name: 'devtools',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // teardown-only: removes the __runtypes genDir the runtypes transform writes during the run
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
