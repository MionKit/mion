import {defineConfig} from 'vitest/config';

// Root vitest config. Each package's own vitest.config.ts is loaded as a
// project via `test.projects` below (Vitest 4 removed the standalone
// `vitest.workspace.ts` file — project definitions must live inline in the
// root config now). Loading them as projects is what makes their plugins
// (notably ts-runtypes-devtools installed in ts-runtypes/vitest.config.ts)
// actually apply at test time.
//
// The Go binary at bin/ts-runtypes is built by the root `pretest`
// script (see package.json) — it MUST be in place before vitest boots,
// because ts-runtypes-devtools spawns it from its `configResolved`
// hook, which fires during project initialization (before
// any vitest globalSetup would run). Don't add a globalSetup-based
// rebuild here; it would be too late for the already-spawned child.
export default defineConfig({
  test: {
    projects: [
      'packages/ts-runtypes/vitest.config.ts',
      'packages/ts-runtypes-devtools/vitest.config.ts',
      // The playground engine suite (relocated from the dissolved
      // runtypes-playground package) — a standalone project co-located under
      // ts-runtypes/test/playground, excluded from the marker project above.
      'packages/ts-runtypes/test/playground/vitest.config.ts',
      // The Go-resolver JS sidecar (private, never published) — pure unit
      // tests, no binary involved.
      'packages/ts-runtypes-go-be-sidecar/vitest.config.ts',
      // Mock-format-registry regression: its own project so the test file's
      // runtime import graph stays free of formats value imports (the marker
      // project above excludes it — import-graph isolation is the repro).
      'packages/ts-runtypes/test/mock-format-isolation/vitest.config.ts',
      // The official JSON-Schema-Test-Suite conformance lane — its own project
      // (and its own tsconfig) so the marker project's resolver Program never
      // pays for the generated suite call sites. Modules under its generated/
      // are build output from scripts/core/gen-json-schema-suite.mjs.
      'packages/ts-runtypes/test/json-schema-official/vitest.config.ts',
    ],
    // Coverage is a root-level (cross-project) concern. Vitest 4 removed
    // `coverage.all`; the report now defaults to covered files only, so the
    // explicit `include` below is what keeps whole-source coverage.
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['packages/*/src/**'],
    },
  },
});
