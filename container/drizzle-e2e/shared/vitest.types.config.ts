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
      // Use the conversion’s tsconfig to keep name resolution identical.
      // Lowercase tsconfig is required by runtypes/vite; unknown keys such as the wrapper’s tsConfig are ignored.
      tsconfig: path.resolve(import.meta.dirname, 'tsconfig.json'),
      // Container-local output is discarded with the tree.
      genDir: path.resolve(import.meta.dirname, '.mion'),
      // Comparison fixtures keep slim schemas beside Drizzle materializations.
      downgradeErrors: ['rpc-handler-drizzle-import'],
    }),
  ],
  resolve: {
    // Drizzle suite helpers depend on this alias.
    alias: {'~': path.resolve(import.meta.dirname, 'tests')},
  },
  test: {
    include: ['tests/**/mion-*.test.ts'],
    // Suites create and drop the same tables; parallel workers on one database would race.
    fileParallelism: false,
    pool: 'forks',
    maxWorkers: 1,
    minWorkers: 1,
    isolate: false,
    // Allow for a cold database, about 500 cases, and the resolver scan.
    testTimeout: 120_000,
    hookTimeout: 180_000,
    reporters: ['default'],
  },
});
