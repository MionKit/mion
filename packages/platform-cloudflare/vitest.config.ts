import {defineConfig} from 'vitest/config';
import {resolve} from 'path';
import {mionVitePlugin} from '@mionjs/devtools/vite';

export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    mionVitePlugin({
      tsConfig: resolve(__dirname, 'tsconfig.json'),
    }),
  ],
  test: {
    name: 'platform-cloudflare',
    globals: true,
    environment: 'node',
    include: ['test/**/*.spec.ts'],
    // each describe boots its own workerd process: 10 s is not enough under batch contention
    testTimeout: 30_000,
    hookTimeout: 30_000,
    // the workers bundle is GENERATED per run — never load a committed copy (it goes stale silently)
    globalSetup: ['./globalSetup.ts', '../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
