import {defineConfig} from 'vitest/config';

// The batch transport end to end: the real @mionjs/client + @mionjs/test-server pair, built
// through the vite lane and through `mion compile`, then run under plain node against the built
// dists. Its own project (not devtools-core) because its globalSetup builds the framework dists
// the artifacts import, which every other suite deliberately avoids, and because one run takes
// minutes. No mion plugin here: the suite drives the builds itself.
export default defineConfig({
  test: {
    name: 'batch-transport-e2e',
    environment: 'node',
    include: ['test/e2e/**/*.e2e.ts'],
    globalSetup: ['./test/e2e/globalSetup.ts'],
    testTimeout: 600_000,
    hookTimeout: 600_000,
    maxWorkers: 1,
  },
});
