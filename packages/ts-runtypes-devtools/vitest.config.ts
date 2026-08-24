import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {
    name: '@ts-runtypes/devtools',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The Go binary is built by the root `pretest` script before vitest
    // boots — it MUST exist beforehand because ts-runtypes-devtools
    // (used by the sibling ts-runtypes project) spawns it from its
    // `configResolved` hook, which fires during workspace-project init
    // (before any globalSetup runs). See root vitest.config.ts.
    //
    // setupFiles runs once per test file (in the worker) — this is where
    // we register the cross-file reset hook for the shared ts-runtypes
    // process. See test/setup.ts and test/helpers/inline.ts.
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
