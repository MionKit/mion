---
type: feature
spec: guidelines
status: ready
created: 2026-08-28
---

# Automated drizzle to mion-drizzle code translator

## Intent

A mechanical codemod that rewrites code written against drizzle-orm into code using
the @mionjs/drizzle-orm-* packages. Two consumers: (1) the real-database e2e todo
(docs/todos/drizzle-real-db-e2e.md) vendors drizzle's own ~500-test integration
suites through it, (2) end users get a migration tool for existing drizzle schema
files.

## Direction

Verified against drizzle-team/drizzle-orm at tag 0.45.2 (integration-tests/tests/
{pg,mysql,sqlite}/*-common.ts): the transform can leave every test body untouched.

- Split imports: authoring names (per our manifests: column builders, table
  factories, pgEnum/index/foreignKey/... helpers) move to
  @mionjs/drizzle-orm-<dialect>-core; refineTableType-family and sql come from
  @mionjs/drizzle-orm; operators and everything query-side stay on drizzle-orm.
- Wrap declarations keeping the original name, so downstream references need no
  edits: `const users = pgTable(...)` becomes
  `const usersRT = MD.pgTable(...); const users = toDrizzle(usersRT);`
  (same for pgEnum, pgSchema, sequences; local declarations inside test bodies
  too).
- Out-of-scope authoring surface (views, RLS helpers) is reported, not translated;
  callers decide (the e2e consumer skips those tests by name).
- Implementation shape is the implementer's call (ts-morph / jscodeshift / a small
  TS transform); it should be a repo tool first (scripts/ or a package bin), a
  published consumer tool second.

## Done when

Running the tool over drizzle's three *-common.ts suites yields files that
typecheck against our packages with zero manual edits to test bodies, and a
translated schema file compiles with only the declaration lines changed.
