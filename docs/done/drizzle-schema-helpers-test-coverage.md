---
type: fix
spec: guidelines
status: done
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

## Plan — value-level helper specs (approved 2026-08-29)

One new spec file per dialect package, `src/valueHelpers.spec.ts`, purely
value-level (no marker API, stated in each file header, so the Marker test
coverage rule does not apply):

- pg: the pgSchema handle materializes to a drizzle PgSchema (instanceof +
  schemaName); schema.table (with an extraConfig index) compares equal to the
  dzPg.pgSchema twin via a compact getTableConfig projection, schema
  included; schema.enum materializes schema-qualified with the same
  name/values; schema.sequence and standalone pgSequence (with and without
  options) compare seqName/seqOptions/schema against the raw drizzle twins
  and pass isPgSequence; pgTableCreator applies the name mapper equal to
  dzPg.pgTableCreator and stays memoized.
- mysql: the mysqlSchema handle (instanceof MySqlSchema + schemaName) and
  schema.table vs the raw twin (schema included); mysqlTableCreator name
  mapping vs the raw twin.
- sqlite: sqliteTableCreator name mapping vs the raw twin, memoized.
- Model derivation: InferSelectModel rows of creator/schema tables are
  mutually assignable with the plain-table model (compile-time assignments
  inside a test).

No docs changes (test-only fix, no user-visible behavior). Not a fuzz
candidate (the getTableConfig equality oracle is already pinned per call
shape; no input space to explore). Finish: pnpm test green, lint/format,
git mv the spec to docs/done/.

## Shipped

Landed as `src/valueHelpers.spec.ts` in each of the three dialect packages,
exactly per the plan above: 17 tests covering all six helpers, purely
value-level (no marker API, so the Marker test coverage rule does not
apply; each spec file header says so). Model derivation is checked with
compile-time assignments so the specs stay valid when the type-road
ergonomics rework (PR #166) changes the helpers' return types.
