import {defineConfig} from 'vitest/config';

// Root vitest config — the 5 runtypes projects + the 16 mion projects run from
// one root, and this list is the SINGLE SOURCE OF TRUTH for which projects exist:
// `test:ci` batches them with --project filters (scripts/core/test-batches.mjs), and
// `pnpm run check:test-batches` fails if a project added here belongs to no batch.
// Each package's own vitest.config.ts is loaded as a project via `test.projects`
// below (Vitest 4 removed the standalone `vitest.workspace.ts` file, project
// definitions must live inline in the root config now). Loading them as projects is what makes
// their plugins (notably ts-runtypes-devtools installed in
// ts-runtypes/vitest.config.ts) actually apply at test time.
//
// The Go binary at bin/mion is built by the root `pretest`
// script (see package.json) — it MUST be in place before vitest boots,
// because ts-runtypes-devtools spawns it from its `configResolved`
// hook, which fires during project initialization (before
// any vitest globalSetup would run). Don't add a globalSetup-based
// rebuild here; it would be too late for the already-spawned child.
//
// The `source` resolve conditions come from the mion side (its packages
// resolve each other's source without a build); the mion package configs also
// set them locally, so this is belt-and-braces.
export default defineConfig({
  resolve: {conditions: ['source']},
  ssr: {resolve: {conditions: ['source']}},
  test: {
    projects: [
      // ── runtypes side ──
      'packages/run-types/vitest.config.ts',
      'packages/ts-runtypes-devtools/vitest.config.ts',
      // The playground engine suite (relocated from the dissolved
      // runtypes-playground package) — a standalone project co-located under
      // ts-runtypes/test/playground, excluded from the marker project above.
      'packages/run-types/test/playground/vitest.config.ts',
      // The Go-resolver JS sidecar (private, never published) — pure unit
      // tests, no binary involved.
      'packages/ts-runtypes-go-be-sidecar/vitest.config.ts',
      // Mock-format-registry regression: its own project so the test file's
      // runtime import graph stays free of formats value imports (the marker
      // project above excludes it — import-graph isolation is the repro).
      'packages/run-types/test/mock-format-isolation/vitest.config.ts',
      // ── mion side ──
      'packages/core/vitest.config.ts',
      'packages/router/vitest.config.ts',
      'packages/client/vitest.config.ts',
      'packages/platform-aws/vitest.config.ts',
      'packages/platform-gcloud/vitest.config.ts',
      'packages/platform-node/vitest.config.ts',
      'packages/devtools/vitest.config.ts',
      'packages/drizzle-orm-pg-core/vitest.config.ts',
      'packages/drizzle-orm/vitest.config.ts',
      'packages/drizzle-orm-mysql-core/vitest.config.ts',
      'packages/drizzle-orm-sqlite-core/vitest.config.ts',
      'packages/platform-vercel/vitest.config.ts',
      'packages/platform-uws/vitest.config.ts',
      'packages/uws/vitest.config.ts',
      'packages/platform-cloudflare/vitest.config.ts',
      // Type-instantiation cost budgets for the model pipeline (private, never
      // published) — a pure in-process compile measurement, no plugins.
      'packages/type-budget/vitest.config.ts',
    ],
    // Teardown-only sweep removing every __runtypes genDir under packages/ after the
    // run. Belt-and-braces with each project's own teardown, and the only cleanup
    // that fires on FILTERED runs (`vitest run <pattern>`): initializing a project
    // boots its runtypes resolver and writes its genDir even when none of its tests
    // run, and per-project teardowns only fire for projects that ran — while the
    // root project's globalSetup initializes on every run.
    globalSetup: ['./scripts/lib/vitest-clean-gendir.ts'],
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
