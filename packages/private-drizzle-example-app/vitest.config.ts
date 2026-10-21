import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

// The plugin resolves tableFromType / toDrizzle markers and gives the routes their build-time validators.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    mionVitePlugin({
      tsConfig: resolve(__dirname, 'tsconfig.json'),
      client: {routes: 'fetch'},
    }),
  ],
  test: {
    name: 'drizzle-example-app',
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts', 'test/**/*.test.ts'],
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    // heavy: the cost test compiles whole programs
    testTimeout: 120_000,
    hookTimeout: 60_000,
    maxWorkers: 1,
  },
});
