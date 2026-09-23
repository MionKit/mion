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
    name: 'drizzle-pg',
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // Vitest's 10 s default is not enough: the convert round trip builds a consumer tree and runs the CLI, 6 s alone.
    testTimeout: 60000,
    hookTimeout: 60000,
    // teardown-only: removes the .mion genDir the runtypes transform writes during the run
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
