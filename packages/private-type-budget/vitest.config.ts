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
    // Vitest's 10 s default is not enough: modelPipeline's beforeAll compiles six snippets plus the consumer lane.
    // 4.6 s alone, 10.6 s inside the mion-rest batch, where it failed a run.
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
