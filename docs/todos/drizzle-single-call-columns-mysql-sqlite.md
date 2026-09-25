---
type: feature
spec: full-plan
status: ready
created: 2026-09-25
---

# Side-by-side single-call columns for mysql and sqlite

## Problem

The single-call column system (a column type is data plus settings, no methods and no db name;
a builder returns exactly the hand-written type) exists side by side for pg only, in
`packages/drizzle-orm/next/` (dialect-free core) and `packages/drizzle-orm-pg-core/next/`. The
switch to it must happen in all three dialects at once: `@mionjs/drizzle-orm`, `mion convert` and
`mion drizzle-migrate` serve every dialect, and keeping both column shapes alive in the shared core
would be a compatibility layer the repo does not keep. So mysql and sqlite get their `next/` first,
built and measured the same way, with no switch. Any core change the two dialects need shows up
here, while nothing ships.

Nothing here is published: `next/` sits beside `src/`, each package's `tsconfig.build.json`
excludes it, and `scripts/lib/drizzle-line.mjs` counts only `src/` edits as a published change.

## Plan

### 0. Core fixes first (`packages/drizzle-orm/next/`)

- Error texts that name pg: `table.ts:56` ("built with pgTable()"), `fromType.ts:112`
  ("Varchar, Uuid"), `fromType.ts:218` ("PgTable"). Make them dialect-neutral or pass the name in.
- `refine.ts` repeats the `ColBaseFlag` union inline (about lines 159 and 161); use the type.
- Keep `ColBaseFlag`, `IsHasDefault`, `InsertKind` and `KeyFlagsOf` (`columns.ts`) as they are:
  they already cover `autoincrement`, `onUpdateNow`, `primaryKeyHasDefault` and
  `primaryKey: [{autoIncrement: true}]`. Pin each with a type test in the dialect that uses it.

### 1. mysql (`packages/drizzle-orm-mysql-core/next/`, mirror of the pg files)

- `columns.ts`: written-out input interfaces, one per kind, like `PgColIn` / `PgIntIn`:
  `MysqlColIn` (common: `notNull`, `default`, `$type`, `$default`, `$defaultFn`, `$onUpdate`,
  `$onUpdateFn`, `primaryKey`, `unique: true | [name]`, `references`, `generatedAlwaysAs`),
  `MysqlIntIn` (+ `autoincrement`), `MysqlTimestampIn` (+ `defaultNow`, `onUpdateNow`).
  All 27 builders from `src/columns.ts` with the pg overload set (`()`, `(props)`, `(name)`,
  `(name, props)`; required-config builders drop the first and third). Reuse the `src/` config
  and data helpers. The data type depends on `mode` and `unsigned`, which move from the overload
  generics onto the const props (`int({unsigned: true})` gives `UInt32`).
  `serial` carries base `'notNull' | 'hasDefault' | 'autoincrement'` (`src/columns.ts:488-496`).
- `mysqlEnum(name?, values, props?)`: a `recordColumn` builder over the shipped one, with a type
  twin (the shipped one has none); `tableFromType` may keep refusing it, like pg's enum.
- `customType`, as pg's.
- `table.ts`: `MysqlTable<TName, Cols, Extras, Names>`, `mysqlTable` with the inline column and
  names maps (never an alias carrying the builders), `mysqlTableCreator`, `mysqlSchema` (its
  `.table` and `.view`), `tableFromType`.
- `views.ts`: `mysqlView` with `algorithm`, `sqlSecurity`, `withCheckOption`, `as`, `existing`.
- `helpers.ts`: `foreignKey` taking `tableRef()` for the other table, like pg's.
- `drizzle.ts`: `SynthConfig` over the spec, like pg's, BUT `isPrimaryKey`, `isAutoincrement` and
  `hasRuntimeDefault` come from `KeyFlagsOf<Spec>`, because `$returningId()` reads them
  (`src/drizzle.ts:49-52`). pg and sqlite keep them `false`. `ToDrizzleTable`, `ToDrizzleView`,
  and the `toDrizzle` overloads including `MySqlSchema`, a standalone index entry and the marker.
- Add `"next"` to `packages/drizzle-orm-mysql-core/tsconfig.build.json` `exclude`.

### 2. sqlite (`packages/drizzle-orm-sqlite-core/next/`)

- `columns.ts`: one input interface `SqliteColIn` (no `defaultNow`, no `autoincrement`):
  `primaryKey: true | [{autoIncrement?, onConflict?}]`, `generatedAlwaysAs: [v] | [v, {mode}]`.
  Builders `blob`, `integer`, `int`, `numeric`, `real`, `text` with their modes
  (`integer({mode: 'timestamp'})` gives `Date`). `integer` and `int` carry base
  `'primaryKeyHasDefault'` (the rowid, `src/columns.ts:143,161`). `customType`.
- `table.ts`, `views.ts`, `helpers.ts`, `drizzle.ts` as pg's, with `SqliteTable<TName, Cols,
  Extras, Names>`, `sqliteTableCreator`, `sqliteView`.
- Add `"next"` to `packages/drizzle-orm-sqlite-core/tsconfig.build.json` `exclude`.

### 3. Shared fuzz source

pg's `packages/drizzle-orm-pg-core/test/tableSpecShared.ts` holds a generic part (the `Surface`
interface, `buildTable`, the single-call renderer shape) and a pg part (`makeSpec`'s kind table,
the `getTableConfig` projection, the `PgTable` renderers). Move the generic part to
`packages/drizzle-orm/test/` and give each dialect its own kind table, projection and renderers.
Never change what the pg fuzz generates (same seeds must give the same tables).

### 4. Measure

- `packages/private-type-budget/test/columnFormats.compile.test.ts`: a mysql and a sqlite block
  with the same four lines (shipped builders, shipped types, new types, new builders) for three
  shapes: five mixed columns select, wide vocabulary, and `toDrizzle` plus three queries
  (`MySqlDatabase` with `$returningId()`, `BaseSQLiteDatabase`). Budgets on the new lines only,
  one way down. `reports/column-formats.md` gets the rows.
- `packages/drizzle-orm/TYPE-COST.md`, section "Side by side: columns as type formats": one short
  paragraph per dialect with the numbers and anything that behaved differently from pg.

## Tests

For each of mysql and sqlite, in `test/next/`, mirroring `drizzle-orm-pg-core/test/next/`:

- `type-pins.stub.ts`: every builder column equals its hand-written column, loose and inside a
  table; builder table equals its twin (narrow, wide vocabulary, db names, `tableRef` reference,
  self-reference with `TableRef<'t', 'id'>`); models equal the SHIPPED models for the same table;
  wrong settings rejected (`@ts-expect-error`: `autoincrement` on `varchar`, `defaultNow` on a
  sqlite column, `onUpdateNow` off a timestamp). mysql: `unsigned` and `mode` data types,
  `$returningId()` returns exactly the autoincrement and runtime-default primary keys (as
  `test/type-pins.stub.ts:235-242` does today). sqlite: an integer primary key is optional on
  insert, a text one required; select / insert / update through `DrizzleD1Database` and
  `DrizzleSqliteDODatabase` (as `test/type-pins.stub.ts:198-251`).
- `typeTables.spec.ts`: `getTableConfig(toDrizzle(new))` equals raw drizzle and the shipped
  road; `tableFromType<Twin>()` rebuilds the same table; runtype ids equal for builder table,
  twin and models in BOTH `getRunTypeId` call shapes (paired, Marker test coverage rule);
  builder tables reflected with no twin reflected first; `mysqlSchema` / table creators;
  views; enums; the refusals.
- `drizzleTypeSource.integration.spec.ts`: the resolver fuzz, random specs rendered as a
  hand-written type and as builders in one fixture, ids compared, as pg's.
- `tableEquality.fuzz.spec.ts` in each package's `test/`: surfaces raw drizzle, shipped
  builders, new builders, and the two type-road readers; the `getTableConfig` projection must
  match. This is also the first fuzz the shipped mysql and sqlite roads get.
- `packages/private-type-budget/test/declarationEmit.test.ts` and `drizzleFreeAuthoring.test.ts`:
  one next case per dialect.
- `pnpm miondevx core drizzle-translate --to-types` stays green (shipped road untouched).

## Fuzzing

Yes, and cheap: the oracle is raw drizzle's `getTableConfig` for the same random spec, plus
equal runtype ids for builder and hand-written twins. Design both with the fuzzy-testing skill.
Negative controls: break one mod in the recorder and one flag rule in the models, each must fail.
Soak with `MION_FUZZ_ITER=40` and several seeds.

## Docs

None, because nothing public changes: `next/` is not exported. `TYPE-COST.md` and the budget
report are updated (see Measure).

## Out of scope

- Switching any dialect to the new system, `mion convert`, `mion drizzle-migrate`, the
  drizzle-e2e lane on the new shape: the switch, which follows this.
- Pure-function callbacks in a table type.
- Typed `extraConfig` entries on a builder table.

## Done when

- `next/` exists for mysql and sqlite with the full builder vocabulary, tables, views, schemas and
  table creators, enums, `foreignKey`, `toDrizzle` types.
- Every test above passes, both fuzzes soaked with their negative controls firing.
- Budgets and `TYPE-COST.md` updated; the shipped system and its budgets unchanged.
- The simplify-comments pass ran on every touched source file, committed on its own (no page or
  example changes, so no simplify-docs pass).
