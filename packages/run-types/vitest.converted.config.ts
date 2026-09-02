import {defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

// The CONVERTED-SUITES project: the same suite tree, rewritten into the value
// forms by `mion convert`, running against the same assertions.
//
// It is deliberately NOT in the root config's `projects` list. The trees it
// runs (test/converted-<target>/) are generated and gitignored, so a tracked
// project entry would point at paths that usually do not exist. `pnpm miondevx core
// converted-suites` generates them, runs vitest with THIS config, and deletes
// them again — that command is the only thing that ever loads this file.
//
// Everything else mirrors the marker project (plugin, conditions, timeouts) so
// a failure here means the CONVERSION changed behaviour, never that the two
// projects were configured differently. The one difference is the tsconfig:
// the converted trees are excluded from tsconfig.test.json (so the ordinary
// lanes never see them) and named by tsconfig.converted.json instead.
const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/mion'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.converted.json',
      emitMode: 'both',
      // Same opt-out as the marker project: the suites deliberately contain
      // Error-severity types (the alwaysThrow cases), so the strict default
      // would refuse to boot.
      failOnError: false,
    }),
  ],
  test: {
    name: 'converted-suites',
    globals: true,
    environment: 'node',
    // Explicit: loaded via `--config` from the repo root (not as a project),
    // vitest would otherwise resolve `include` against the repo root.
    root: PACKAGE_ROOT,
    include: ['test/converted-*/**/*.test.ts'],
    // The two enrich lanes that SPAWN the CLI are excluded, and only those.
    // They drive `mion enrich` over fixture projects they generate at
    // runtime, writing through a `.tmp` root and a repo-level `__runtypes/`
    // output that are anchored by absolute path — so the builders copy, the
    // JSON Schema copy and the original all target one directory and reconcile
    // on top of each other. Nothing about that exercises the CONVERSION: the
    // fixtures are written by the test, not by the suite file, so the notation
    // the suite file is authored in never reaches the CLI. Every other enrich
    // test (the type-driven `cases/`, createFriendlyText, …) converts and runs.
    exclude: ['**/enrich/enrichTranslate.test.ts', '**/enrich/enrichReconcile.test.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    setupFiles: ['./test/support/setup.ts'],
  },
});
