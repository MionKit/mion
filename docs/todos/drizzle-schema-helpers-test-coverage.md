---
type: fix
spec: guidelines
status: ready
created: 2026-08-29
---

# Test coverage for the schema / creator / sequence authoring helpers

## Intent

Six authoring helpers of the drizzle dialect packages are marked `migrated` in
the manifests but have ZERO spec coverage: nothing pins that the recorded
value materializes into the correct drizzle object through toDrizzle.

- pg: `pgSchema` (and its `.table` / `.enum` / `.sequence` members),
  `pgSequence`, `pgTableCreator`
- mysql: `mysqlSchema`, `mysqlTableCreator`
- sqlite: `sqliteTableCreator`

The drizzle-proxy-migration rules say a `migrated` manifest entry lands with
paired tests; these landed without them (predates the type-road ergonomics
rework, found while auditing that surface on PR #166).

## Evidence

- `packages/drizzle-orm-*-core/manifests/*.manifest.json` list all six as
  `status: "migrated"`.
- `grep -rn "pgSchema\|pgTableCreator\|pgSequence\|mysqlSchema\|mysqlTableCreator\|sqliteTableCreator" packages/*/src/*.spec.ts`
  returns nothing.
- Implementations: `packages/drizzle-orm-pg-core/src/table.ts` (pgSchema,
  pgTableCreator, PgSequence), `packages/drizzle-orm-pg-core/src/helpers.ts`
  (pgSequence, pgEnum), and the mysql/sqlite twins.

## Direction

Add specs beside the existing per-dialect suites (e.g. in each package's
`src/index.spec.ts` or a new `src/valueHelpers.spec.ts`) that compare the
materialized result against building the same thing with raw drizzle:

- pgSchema: a table declared via `schema.table(...)` materializes into a
  drizzle table whose schema matches `dzPg.pgSchema('...').table(...)`
  (compare getTableConfig, including the schema); the schema handle itself
  materializes to drizzle's PgSchema; `schema.enum` and `schema.sequence`
  round through toDrizzle.
- pgTableCreator / mysqlTableCreator / sqliteTableCreator: the name-mapper is
  applied (a table declared as 'users' materializes with the mapped name),
  equal to raw drizzle's tableCreator result.
- pgSequence / mysqlSchema: toDrizzle returns the drizzle object with the
  recorded name and options.
- Model derivation still works on creator/schema tables (InferSelectModel over
  a creator table equals the plain-table model).
- Any test exercising the marker API must follow the Marker test coverage
  rule (both getRunTypeId call shapes) per ts-go-runtypes/CLAUDE.md; if these
  specs stay purely value-level, say so in the spec header instead.

## Out of scope

New helper functionality, manifest regeneration, and the type road (these
helpers are builders-only by design).

## Done when

Each of the six helpers has a spec pinning its materialized drizzle object
against the raw drizzle equivalent, `pnpm test` is green, and the specs live
in the dialect packages beside the existing suites.
