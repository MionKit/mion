import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

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
    name: 'router',
    globals: true,
    environment: 'node',
    include: ['src/**/*.spec.ts'],
    // teardown-only: removes the .mion genDir the runtypes transform writes during the run
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
    env: {
      // Prevent test-server modules from auto-starting servers when imported
      MION_TEST_SERVER_AUTO_START: 'false',
    },
  },
});
