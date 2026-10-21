import {configDefaults, defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// Installs the runtype transformer as a Vite plugin so test files get their markers rewritten and the
// `caches/*.ts` bodies overlaid with the Go binary's output. `resolve.conditions: ['source']` (and SSR's copy)
// picks the `"source"` exports entry, the same condition tsconfig.json declares for tsgo, so vite and tsgo both
// land on the in-tree source with no aliases. `cwd` is the package dir and tsconfig.json includes `test/**`, so
// the Go resolver's Program covers every file vitest loads; the build config narrows back to src.
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'mion-bin/mion'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.json',
      // 'both' so the suites cover BOTH materialisation paths on every case: createXxx<T>() reads the inline
      // entry.createRTFn, deserializeXxx<T>() rebuilds from entry.code. Production defaults to 'code' for size.
      emitMode: 'both',
      // NO downgradeErrors here on purpose: this program DELIBERATELY contains Error-severity types, and each of
      // those ~200 call sites says so in its own source. A wildcard made a real finding indistinguishable from an
      // expected one, which is how nine call sites silently compiled the default encoder strategy.
      // The disk cache follows TypeScript's `incremental`, which tsconfig.json turns off, so these runs never
      // write artifacts; devtools/test/cache-disk.test.ts covers that feature with the cache forced on.
    }),
  ],
  test: {
    name: 'runtypes',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // test/playground/** is the relocated playground engine suite — it runs as
    // its own project (no @mionjs/devtools transform, no marker setup files),
    // so keep it out of this one to avoid a double-run.
    // test/mock-format-isolation/** is the mock-format-registry regression: it
    // must run in a process whose ONLY formats import is type-only, and inside
    // this project any sibling test file's formats value import would mask it.
    // test/converted-*/** are the generated converted-suite trees — gitignored,
    // present only while `pnpm miondevx core converted-suites` runs, and driven by
    // vitest.converted.config.ts. Excluding them keeps `pnpm test` from picking
    // up a half-generated tree if the lane is interrupted.
    exclude: [...configDefaults.exclude, 'test/playground/**', 'test/mock-format-isolation/**', 'test/converted-*/**'],
    // Generating + validating the deepest mock cases (e.g. a 3-D string array,
    // MOCK_ITERATIONS times) takes a few seconds; under the full suite's
    // parallel CPU contention that occasionally crossed vitest's tight 5 s
    // default and timed out. Give every case comfortable headroom (mirrors the
    // playground project's timeout). Real hangs still fail, just later.
    testTimeout: 30000,
    // Same contention headroom for hooks: enrichCheck's beforeAll does ~10s+
    // of real work per category and crossed the 10s default under full-suite
    // parallel load.
    hookTimeout: 30000,
    setupFiles: ['./test/support/setup.ts'],
    // Removes the generated <PACKAGE_ROOT>/.mion output tree after the
    // whole suite (teardown only — the shared file derives the genDir from this
    // project's root, which is exactly the plugin's `cwd` above). The old local
    // test/support/global-cleanup.ts resolved one directory short (test/.mion)
    // and so never actually removed the tree.
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
