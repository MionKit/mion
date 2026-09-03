// The TYPE-ROAD tree's vitest config, copied into /drizzle-e2e/types.
//
// The one difference from vitest.config.ts, and the whole reason this file
// exists: the devtools plugin. `tableFromType<UsersTable>()` is a MARKER call,
// so nothing resolves its type argument without the build transform, and no
// other lane has ever put that chain (marker -> resolver -> generated cache ->
// the bridge) in front of a real database. Everything else matches the
// builders tree, because the two runs are compared test for test.
import {defineConfig} from 'vitest/config';
import path from 'node:path';
import runTypes from '@mionjs/devtools/runtypes/vite';

export default defineConfig({
  plugins: [
    runTypes({
      // The tsconfig the conversion itself was checked with, so the transform
      // and the typecheck can never disagree about how a name resolves.
      // Lowercase `s`: `@mionjs/devtools/runtypes/vite` takes `tsconfig`, and an
      // unknown key is silently ignored (`tsConfig` is @mionjs/devtools' own
      // spelling, which that wrapper maps across).
      tsconfig: path.resolve(import.meta.dirname, 'tsconfig.json'),
      // Inside the tree, which is container-local and thrown away with it.
      genDir: path.resolve(import.meta.dirname, '.mion'),
    }),
  ],
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
    maxWorkers: 1,
    minWorkers: 1,
    isolate: false,
    // The suites are long; a cold database plus ~500 cases needs room, and this
    // tree also pays the resolver's scan on the way in.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    reporters: ['default'],
  },
});
