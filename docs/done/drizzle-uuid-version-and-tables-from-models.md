---
type: feature
spec: guidelines
status: done
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
- `version` is mion's own setting: it types the model field and replays as the default for that version
  (see What shipped). `mion convert` already carries it as a plain config literal.
- Tests: core recorder + fromType units, pg typeTables (both roads equal raw drizzle, validator checks the version,
  both `getRunTypeId` shapes), type pins, convert round trip, pg e2e addendum row round trip.
- Docs: column-formats PostgreSQL row + tip; overview "Union Models" section with a private example.
- Not fuzzed: two values, both pinned against raw drizzle and their default sql in typeTables.spec.ts.

## What shipped

Diverged from the plan on the maintainer's call: `version` is a shortcut for the default plus the type, not type-only.

- Checked first: Postgres's uuid column takes any version; drizzle (0.45.4, 1.0 beta) has no version 7 builder;
  `defaultRandom()` writes `gen_random_uuid()` (version 4).
- `version: '7'` = `default: [sql\`uuidv7()\`]` (PostgreSQL 18) + UUIDv7 field; `'4'` = `defaultRandom` + UUIDv4.
  Counts as a default (optional on insert, pg's `hasDefault` base flag). A second `default` / `defaultRandom` throws
  when the table is declared: a compile error cost about 35 type instantiations per uuid column, so the maintainer
  chose the runtime error. The typing is one conditional on the props (about +7 per uuid column), a reviewed budget
  raise in private-type-budget.
- Core: a `ColumnShortcuts` type; `recordColumn` and `rtTableFromRunType` take the dialect's shortcuts and replay
  each as its modifier. pg's `uuid()` and `tableFromType` pass the uuid one (`src/columns.ts`).
- The e2e image is postgres 17: the addendum adds a stand-in `uuidv7()` function, creates the table from the recorded
  defaults and checks a real row gets a version 7 id and a version 4 token.
- Release: a republished dialect's `@mionjs/drizzle-orm` peer is floored at the core version it ships with
  (`rootPeerRangeFor` in `scripts/lib/drizzle-line.mjs`), so pg 0.45.2 cannot pair with core 0.45.1, which ignores
  `version`.
