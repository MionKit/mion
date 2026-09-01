import {configDefaults, defineConfig} from 'vitest/config';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import runtypesPlugin from '@mionjs/devtools/runtypes/vite';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const PACKAGE_ROOT = resolve(HERE);
const REPO_ROOT = resolve(HERE, '../..');

// Mirrors the run-types/vitest.config.ts shape: install the runtype
// transformer as a Vite plugin so test source files (which import
// `createValidateFn` and friends from `mion`) get
// rewritten with the resolved runtype id at compile time, AND the
// three cache modules under `caches/*.ts` get their bodies overlaid by
// the plugin's `transform()` hook with the Go binary's rendered output.
//
// `resolve.conditions: ['source']` picks up the `"source"` exports
// entry on `mion`'s package.json (pointing at
// `src/index.ts`) — same condition `tsconfig.test.json` declares for
// tsgo via `customConditions`. The two resolvers (vite at runtime,
// tsgo for type-checking the marker scan) now both land on the same
// in-tree source, with no alias plumbing required. SSR's resolver
// honors the same conditions list.
//
// `cwd` is the package dir + `tsconfig.test.json` extends the build
// config to also include `test/**`, so the Go resolver's Program
// covers every file vitest loads. The build tsconfig stays strict
// (src-only) so `pnpm build` doesn't compile test files into dist.
export default defineConfig({
  resolve: {
    conditions: ['source'],
  },
  ssr: {resolve: {conditions: ['source']}},
  plugins: [
    runtypesPlugin({
      binary: resolve(REPO_ROOT, 'bin/mion'),
      cwd: PACKAGE_ROOT,
      tsconfig: 'tsconfig.test.json',
      // Force 'both' emit for the test run so suites cover BOTH
      // materialisation paths on every case:
      //   - createValidateFn<T>() / createXxx<T>() → reads entry.createRTFn
      //     (the inline closure baked in by the Go renderer)
      //   - deserializeValidate<T>() / deserializeXxx<T>() → ignores the
      //     inline closure and rebuilds the factory from entry.code via
      //     `new Function('utl', code)`.
      // The production default is 'code' (code string only) so emitted modules
      // are smaller; runtimes without `new Function` opt into 'functions' or
      // 'both' on the plugin themselves.
      emitMode: 'both',
      // This test program DELIBERATELY contains Error-severity types (the
      // alwaysThrow suites pin the runtime throw for root-position symbols,
      // functions, …), so the strict default (failOnError: true — Error
      // diagnostics fail every lane, vitest included) would refuse to boot
      // the project. This opt-out is the documented escape hatch for exactly
      // this shape of program; consumers keep the strict default.
      failOnError: false,
      // The on-disk RT artifact cache follows TypeScript's incremental switch,
      // and `tsconfig.test.json` sets `incremental: false`, so these test runs
      // are cache-off with no knob — they never pollute node_modules/.cache
      // with thousands of artifact files. The disk-cache feature has its own
      // dedicated end-to-end suite (devtools/test/cache-disk.test.ts,
      // which forces the cache on at an os.tmpdir() path).
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
    // present only while `pnpm rtx core converted-suites` runs, and driven by
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
    // parallel load (docs/done/enrichcheck-beforeall-hook-timeout-under-load.md).
    hookTimeout: 30000,
    setupFiles: ['./test/support/setup.ts'],
    // Removes the generated <PACKAGE_ROOT>/__runtypes output tree after the
    // whole suite (teardown only — the shared file derives the genDir from this
    // project's root, which is exactly the plugin's `cwd` above). The old local
    // test/support/global-cleanup.ts resolved one directory short (test/__runtypes)
    // and so never actually removed the tree.
    globalSetup: ['../../scripts/lib/vitest-clean-gendir.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
