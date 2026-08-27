import {defineConfig} from 'vitest/config';

// The type-cost budget project. No plugins on purpose: every test here is a
// pure in-process TypeScript compile measurement, so nothing spawns the
// runtypes resolver and no genDir is written.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    name: 'type-budget',
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
