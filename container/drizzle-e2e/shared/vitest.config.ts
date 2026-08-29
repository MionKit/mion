// The translated tree's vitest config, copied into /work.
//
// Standalone by design: it is loaded with `--config` and is never a project of
// the root vitest.config.ts, so `pnpm test` neither sees it nor needs a database.
// Same posture as packages/ts-runtypes/vitest.converted.config.ts.
import {defineConfig} from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    // drizzle's suites reach their helpers through this alias.
    alias: {'~': path.resolve(import.meta.dirname, 'tests')},
  },
  test: {
    include: ['tests/**/mion-*.test.ts'],
    // One file at a time, and no parallelism inside it: the suites create and
    // drop the SAME table names constantly, so two workers on one database race.
    fileParallelism: false,
    pool: 'forks',
    poolOptions: {forks: {singleFork: true}},
    // The suites are long; a cold postgres plus ~500 cases needs room.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    reporters: ['default'],
  },
});
