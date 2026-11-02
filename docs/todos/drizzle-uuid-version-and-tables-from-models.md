---
type: feature
spec: guidelines
status: ready
created: 2026-11-02
---

# Drizzle: a version option on uuid columns, and documenting "table first"

## Intent

Porting the mion-starters Next.js starter's drizzle schema to 0.13 showed two gaps. Investigation in the
mion-starters repo, `docs/investigations/mion-0.13-migration/nextjs.md`, issue 13.

1. **uuid version.** `DZ.uuid` columns are typed as a uuid of any version, so a model using `UUIDv7` does not fit
   (`Type '"7"' is not assignable to type '"any"'`). `$type: $type<TF.UUIDv7>()` works. A version option on the
   column would say it directly.
2. **Table first.** 0.8's `toDrizzlePGTable<Order>(name, overrides)` built a table from an API model. 0.13 goes the
   other way: write the table, infer the type. Decided: no table-from-model feature. Document "write the table,
   infer the model", including what to do when a model is a union (keep it handwritten next to the table).

## Direction

The implementer plans the details. Verified pointers:

- `@mionjs/drizzle-orm-pg-core` `PgUuidIn` (`.dist/esm/src/types.d.ts` in the published package). Check whether the
  mysql and sqlite cores have an equivalent uuid column. These packages ride drizzle's version line: read
  `packages/AGENTS.md` and the drizzle-slim-schemas skill first.
- The drizzle-e2e lane (`container/AGENTS.md`) proves the packages against real databases.

## Docs

- `container/website/content/02.runtypes/04.drizzle-orm/01.column-formats.md`, "PostgreSQL" (and the other
  dialects if they change).
- `00.drizzle-overview.md`, "Writing a Table as a Type" or "Refining Tables for Your API", for the table-first
  guidance.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- A `UUIDv7` model field maps onto a uuid column without `$type`, with tests, and the drizzle-e2e lane is green.
- The docs show the table-first road, union models included.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file,
  each committed on its own.

## Plan: uuid version + union models docs (approved 2026-11-02)

Approved through the delegation brief from the parent session (maintainer decisions: no table-from-model feature).

- pg only: drizzle's mysql and sqlite cores have no uuid column.
- `PgUuidConfig {version?: '4' | '7'}` + `UuidData<C>` in pg `types.ts`; `uuid()` and the `Uuid` column type take it.
- `version` is mion's own: core `typeOnlyConfigNames` lists it, the builder road (`recordColumn`) and the type road
  (`fromType.ts`) leave it out of drizzle's call. `mion convert` already carries it as a plain config literal.
- Tests: core recorder + fromType units, pg typeTables (both roads equal raw drizzle, validator checks the version,
  both `getRunTypeId` shapes), type pins, convert round trip, pg e2e addendum row round trip.
- Docs: column-formats PostgreSQL row + tip; overview "Union Models" section with a private example.
- Not a fuzz candidate: a type-only key with three values, covered by the existing table-equality fuzz on uuid.
