---
type: feature
spec: guidelines
status: ready
created: 2026-11-02
---

# Drizzle: versioned uuid columns and a table from a model type

## Intent

Porting the mion-starters Next.js starter's drizzle schema to 0.13 showed two gaps (investigation in the
mion-starters repo, `docs/investigations/mion-0.13-migration/nextjs.md` issue 13):

1. `DZ.uuid` columns are typed as a uuid of any version, so a model using `UUIDv7` does not fit
   (`Type '"7"' is not assignable to type '"any"'`). `$type: $type<TF.UUIDv7>()` works, but a version option on
   the column would say it directly.
2. The 0.8 `toDrizzlePGTable<Order>(name, overrides)` built a table from an API model. 0.13's `tableFromType<T>`
   takes a table type, not a model, so the starter writes every table and its model twice, and a discriminated-union
   model (`OrderEvent`) cannot come from one table.

## Direction

The implementer plans the details; decide first whether (2) is wanted at all or whether "write the table, infer
the model" is the intended road (then document that instead).

- `@mionjs/drizzle-orm-pg-core` `PgUuidIn` (`.dist/esm/src/types.d.ts` in the published package); same check for
  the mysql and sqlite cores. These packages ride drizzle's version line (`packages/AGENTS.md`).
- `tableFromType`, `refineTableType` in `packages/drizzle-orm`.
- Proven against real databases by the drizzle-e2e lane (`container/AGENTS.md`).

## Docs

`container/website/content/02.runtypes/04.drizzle-orm/01.column-formats.md` "PostgreSQL" (and the other dialects
if they change), `00.drizzle-overview.md` "Writing a Table as a Type" / "Recorded Tables From a Type".

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A `UUIDv7` model field maps onto a uuid column without `$type`, and the model-to-table question is settled in
  code or in the docs, with tests and the drizzle-e2e lane green.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.
