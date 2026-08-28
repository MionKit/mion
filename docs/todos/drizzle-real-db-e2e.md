---
type: chore
spec: guidelines
status: ready
created: 2026-08-28
---

# Real-database e2e tests reusing drizzle's own suites

## Intent

Nothing today proves a toDrizzle table WORKS against a real database: the runtime
oracle compares getTableConfig structure, no test creates a table or runs a query,
and no package depends on a DB driver. Reuse drizzle's own integration suites
(investigated 2026-08-28 at tag 0.45.2, feasibility confirmed: vitest, ~500 tests
in driver-agnostic common files, built-in skipTests, Apache-2.0) so our recorders
are exercised by the same tests drizzle itself trusts, against real databases.

## Direction

Depends on docs/todos/drizzle-code-translator.md, which runs FIRST.

- Vendor integration-tests/tests/{pg,mysql,sqlite}/*-common.ts (plus the helpers
  they need) from drizzle-team/drizzle-orm at the pinned tag, translated by the
  codemod; keep the Apache-2.0 notice. Re-vendoring on a drizzle bump should be a
  re-run of the tool, not manual work.
- Drivers, cheapest first: pg via pglite (in-process, containerless; their
  pglite.test.ts runs the whole common suite), sqlite via better-sqlite3
  (in-process). mysql needs a real server: adapt their dockerode createDockerDB to
  podman, following the repo's container conventions (scripts/lib/engine.mjs;
  heavy deps stay OUT of the workspace lockfile per the containerized-app policy,
  e.g. an isolated _deps project like container/*/ if the drivers are heavy).
- Skip list: views/materialized views (v1-skipped in our manifests), RLS, migrator
  internals, driver-init tests; everything else should pass. A failing translated
  test is a real recorder bug.
- These suites are EXPENSIVE, so they do not join the per-PR test run. They run in
  the pre-publish lane (pre-publish.yml), and only when the drizzle packages or
  dialects actually changed; reuse the same changed-sources detection the drizzle
  release line already has (scripts/lib/drizzle-line.mjs publish-on-change logic).
  Locally they stay on demand via a pnpm rtx command.
- Cross-check the manifests afterwards: any migrated column builder the vendored
  suites never touch gets a small CRUD addendum so absolutely all builders hit a
  real database.

## Done when

The translated pg, mysql and sqlite common suites run green against real databases
(pglite, mysql-in-podman, better-sqlite3) locally via pnpm rtx, and in the
pre-publish lane gated on drizzle package/dialect changes; the skip list is written
down with reasons, and every migrated column builder in the manifests is exercised
by at least one executed test.
