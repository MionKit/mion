import {defineConfig} from 'vitest/config';

// The transform/lint suite (was the @mionjs/devtools project before the two
// devtools packages merged). It stays a SEPARATE vitest project from the mion one
// next to it, deliberately: `vitest.config.ts` installs mionVitePlugin over its own
// sources, and running these 87 files through that transform would change what they
// exercise. One package, two projects.
export default defineConfig({
  test: {
    name: 'devtools-core',
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // The Go binary is built by the root `pretest` script before vitest boots — it
    // MUST exist beforehand because the transform spawns it from `configResolved`,
    // which fires during project initialization (before any globalSetup runs).
    // See root vitest.config.ts.
    //
    // setupFiles runs once per test file (in the worker) — this is where the
    // cross-file reset hook for the shared resolver process is registered.
    // See test/setup.ts and test/helpers/inline.ts.
    setupFiles: ['./test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**'],
    },
  },
});
