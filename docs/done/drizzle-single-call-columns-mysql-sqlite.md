---
type: feature
spec: full-plan
status: done
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

## Use the pg version as the reference

Build every mysql and sqlite file by copying its pg twin and changing only what the dialect needs.
Read these first, in this order. They are the tested answer to most questions this spec leaves open.

| pg file | What it holds | What changes for mysql / sqlite |
|---|---|---|
| `packages/drizzle-orm/next/columns.ts` | `Column`, `NamedColumn`, `PropsOf`, `Writable` / `MutableTuple`, `$type()`, the lazy flag rules (`IsNotNull`, `IsHasDefault`, `IsInsertExcluded`, `InsertKind`, `KeyFlagsOf`) | Nothing expected (shared core). Change it only if a dialect proves it wrong, with a pg pin showing pg is unaffected. |
| `packages/drizzle-orm/next/table.ts` | `RtTableMeta<TName, Cols, Extras, Names>`, `DbNameOf`, `TableRef`, `tableRef()`, `refColumn()` | Only the pg wording in the `tableRef()` error. |
| `packages/drizzle-orm/next/recorder.ts` | `recordColumn(args, init)`: splits props into drizzle's config argument and modifier calls (by `isColModName`), replays mods in key order, skips `$type`, resolves `references` through `refColumn` | Nothing expected. `autoincrement`, `onUpdateNow` are already mod names (`packages/drizzle-orm/src/typeColumns.ts`). |
| `packages/drizzle-orm/next/fromType.ts` | `buildRtTableFromGraph`: rebuilds a slim table from a reflected hand-written type; refuses `enum` / `custom`; names from the table's `names` member | Only the pg wording in errors; the dialect is already a parameter. |
| `packages/drizzle-orm/next/models.ts`, `refine.ts` | Select / insert / update models, `refineTableType` | Nothing expected. |
| `packages/drizzle-orm-pg-core/next/columns.ts` | Input interfaces (`PgColIn`, `PgDateIn`, `PgUuidIn`, `PgIntIn`), `Built<Fn, C, D, B>`, `pgColumn()`, then one block per builder: the hand-written alias (`type Varchar<P extends Config & PgColMods = NoProps> = Column<'varchar', P, VarcharData<P>>`) and its overloads (`<const C extends Config & PgColIn>`); `customType`; `pgColumnHelpers` | The dialect's kinds, configs and data helpers (imported from its own `src/columns.ts`), its mod bags as the alias constraint (`MySqlColMods`, `SqliteColMods`...). |
| `packages/drizzle-orm-pg-core/next/table.ts` | `PgTable` interface, `AnyPgTable`, `LiftCols`, `NameOf`, `pgTable` with INLINE column and names maps in its return type, `tableFromType` memoized per type id | Brand `'mysql'` / `'sqlite'`, `mysqlTableCreator` / `sqliteTableCreator`, `mysqlSchema`. No `enableRLS`. |
| `packages/drizzle-orm-pg-core/next/views.ts` | `pgView` over the new columns, same inline maps | mysql view options (`algorithm`, `sqlSecurity`, `withCheckOption`). |
| `packages/drizzle-orm-pg-core/next/helpers.ts` | `pgEnum` wrapping the shipped enum through `recordColumn`; `foreignKey` mapping `tableRef()` values to live columns | `mysqlEnum` the same way (its second argument is the values, then props). |
| `packages/drizzle-orm-pg-core/next/drizzle.ts` | `SynthConfig` over the column spec, `ToDrizzleTable` / `ToDrizzleView` (db names from the names map), `toDrizzle` overloads including the marker form | mysql reads the three key flags (see below). |
| `packages/drizzle-orm-pg-core/test/next/type-pins.stub.ts` | Every kind of pin this spec asks for, already written for pg | Copy the structure. |
| `packages/drizzle-orm-pg-core/test/next/typeTables.spec.ts` | Runtime parity, `tableFromType`, runtype ids in both call shapes, references, errors | Copy the structure. |
| `packages/drizzle-orm-pg-core/test/next/drizzleTypeSource.integration.spec.ts` | Resolver fuzz: a fixture with both spellings, ids compared through the real resolver | Copy; it needs the dialect's renderers. |
| `packages/drizzle-orm-pg-core/test/tableEquality.fuzz.spec.ts`, `tableSpecShared.ts` | In-process fuzz, the `Surface` abstraction (`singleCall`, `parentRef`), spec generator, renderers, `project()` oracle | See step 3. |
| `packages/private-type-budget/test/columnFormats.compile.test.ts`, `report.ts` (`writeColumnFormatsReport`) | The four-line cost comparison and its report | Add dialect blocks; the report writer may need a dialect column. |
| `packages/drizzle-orm/TYPE-COST.md`, section "Side by side: columns as type formats" | Every design attempt with numbers, kept or rejected | Read before optimising anything. |

## Lessons from building pg (read before coding)

Each of these cost a debugging session on pg. They hold for every dialect.

- **No chained modifiers, and no methods on a column type.** The runtype id walks method return
  types; a chain that returns a new column type per call hits the 512-level depth cap as MKR009.
- **No alias may carry the builders record as a type argument.** The resolver serializes an
  aliased type's arguments, so `mysqlTable` / `sqliteTable` / the views must spell the column map
  and the names map INLINE in their return type, exactly as `pgTable` does. `LiftCols` exists
  only for the `extraConfig` parameter. It showed only when a builder table was reflected with no
  hand-written twin reflected first, so test that case. To find which alias spirals, temporarily
  print the walker's stack where it hits the cap (`classifySpiral` in the Go resolver), then revert.
- **The table's record constraint is `Record<string, object>`.** A union of column shapes cost
  663 against 386 for five columns.
- **Builder props are written-out interfaces**, never `Omit<bag> & runtime keys`.
- **Const config tuples go through `MutableTuple`** (a mapped type over a bare type parameter),
  or an enum tuple stops being a tuple and a builder column stops equalling its twin.
- **The props spelling rule:** a no-argument modifier is `true`, one with arguments is its
  argument tuple (`default: [21]`, `unique: ['uq_name']`, `primaryKey: [{autoIncrement: true}]`).
  Only function keys change in the type: `references: [() => tableRef(t, 'id'), actions]` records
  `{table: 't'; column: 'id'}`, a callback `[fn]` records `true`, `$type: $type<T>()` records `[T]`.
- **A self-reference needs a return annotation** (TS7022): `(): TableRef<'emps', 'id'> =>
  tableRef(emps, 'id')`.
- **A builder table's type records no `extraConfig` entries** (`Extras = []`). A builder table
  equals its twin only when the twin has no extras; compare columns, names and models otherwise.
- **A marker call nested inside another marker call's arguments gets no id** unless that fix has
  landed on main by the time you start (check). Until then, hoist `tableFromType<T>()` to its own
  line before passing it to `toDrizzle({tables: ...})`.
- **Declaration emit** fails TS2883 for helper types an inferred table names while `next/` is not
  exported; `packages/private-type-budget/test/declarationEmit.test.ts` imports them itself.
  Capture the case's `.d.ts` by file name, not "the last one written".
- **mysql `toDrizzle` flags.** pg (and sqlite) keep `isPrimaryKey`, `isAutoincrement`,
  `hasRuntimeDefault` fixed to `false` on purpose; only mysql's `$returningId()` reads them. The
  mysql `SynthConfig` takes them from `KeyFlagsOf<Spec>` (`packages/drizzle-orm/next/columns.ts`,
  which already folds in the `autoincrement` base flag and `$default` / `$defaultFn`).
- **Leave `src/` alone.** It is the shipped system and any edit republishes the package. A real
  bug found there is fixed in its own commit with its own test, like the pg work did.
- **Budgets only go down.** Any increase is a reviewed exception, commented where the budget
  lives with the old and new number and the reason.
- **Lint-staged runs on commit**: unused consts in a `*.stub.ts` fail eslint, so export them.

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
- The mysql builders to port, from `packages/drizzle-orm-mysql-core/src/columns.ts` (kind, config,
  data; line numbers as of 2026-09-25):

  | Builder | Line | Kind | Config | Data |
  |---|---|---|---|---|
  | `bigint` | 161 | int | `{mode, unsigned}`, required | `BigInt64` / `BigUInt64` / `Integer` by mode |
  | `decimal` | 293 | int | `{mode?, precision, scale, unsigned}` | `Float`, `bigint` or `string` (default) |
  | `double`, `float` | 318, 338 | int | `{precision, scale, unsigned}` | `Float` |
  | `real` | 469 | int | `{precision, scale}` | `Float` |
  | `int` | 358 | int | `{unsigned}` | `Int32` / `UInt32` |
  | `mediumint`, `smallint`, `tinyint` | 413, 503, 576 | int | `{unsigned}` | bounded ints |
  | `serial` | 488 | int | none | `PositiveInt`, base `'notNull' \| 'hasDefault' \| 'autoincrement'` |
  | `binary`, `varbinary` | 190, 611 | common | `{length}` (varbinary required) | `string` |
  | `boolean` | 205 | common | none | `boolean` |
  | `char`, `varchar` | 216, 628 | common | `{length, enum}` (varchar required) | `Str` or the enum union |
  | `date`, `datetime` | 248, 270 | common | `{mode}` / `{mode, fsp}` | `Date` / `StringDate` |
  | `json` | 379 | common | none | `unknown` |
  | `text`, `tinytext`, `mediumtext`, `longtext` | 390-609 | common | `{enum}` | `TextDataOf` |
  | `time` | 538 | common | `{fsp}` | `StringTime` |
  | `year` | 660 | common | none | bounded number |
  | `timestamp` | 553 | timestamp | `{mode, fsp}` | `Date` / `StringDate` |
  | `mysqlEnum` | 450 | common | tuple or enum object, with or without a name | the union |
  | `customType` | 675 | | | |

  The shipped chain kinds are `RtMyColumn` (67), `RtMyIntColumn` (82, adds `autoincrement`) and
  `RtMyTimestampColumn` (101, adds `defaultNow`, `onUpdateNow`); the alias constraint bags are
  `MySqlColMods` (134), `MySqlIntColMods` (144), `MySqlTimestampColMods` (148). `mysqlColumnHelpers`
  is at 703. What mysql lacks from pg: `array`, identity, `defaultRandom`, `unique` with `nulls`,
  RLS, materialized views.
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
- The sqlite builders to port, from `packages/drizzle-orm-sqlite-core/src/columns.ts`:

  | Builder | Line | Modes / config | Data | Base |
  |---|---|---|---|---|
  | `blob` | 112-126 | `buffer`, `json`, `bigint` | `Buffer`, `unknown`, `bigint` | |
  | `integer` | 128-154 | `number`, `boolean`, `timestamp`, `timestamp_ms` | `Integer`, `boolean`, `Date` | `'primaryKeyHasDefault'` |
  | `int` | 158-172 | same as `integer`, its own alias so it prints back as `int()` | same | `'primaryKeyHasDefault'` |
  | `numeric` | 174-193 | `string` (default), `number`, `bigint` | | |
  | `real` | 196-204 | | `Float` | |
  | `text` | 206-252 | `json`, `enum`, `length` | `unknown`, the union, `Str<{maxLength}>` | |
  | `customType` | 256-281 | | | |

  The shipped kinds are `RtSqliteColumn` (34; `primaryKey({autoIncrement: true})` sets
  hasDefault) and `RtSqliteIntColumn` (60; any primary key sets it, the rowid). One alias
  constraint bag, `SqliteColMods` (87). `sqliteColumnHelpers` is at 284. Cloudflare D1 and durable
  objects need nothing different at run time; their type pins are
  `packages/drizzle-orm-sqlite-core/test/type-pins.stub.ts:198-251`.
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

## How to run

- One dialect's tests: `pnpm exec vitest run --project drizzle-mysql` (or `drizzle-sqlite`,
  `drizzle-pg`, `drizzle-root` for the core). Type costs: `--project type-budget`.
- Type check: `pnpm run typecheck:test` inside each touched package (the `tsconfig.json` includes
  `next/`, the build config excludes it).
- The resolver fuzz needs the built binary (`pnpm run check:builds`); it skips without it, so
  check it ran. Replay a fuzz failure with `MION_FUZZ_SEED`, widen with `MION_FUZZ_ITER`.
- The shipped road must stay green: `pnpm miondevx core drizzle-translate --to-types` reports
  the same type-error count before and after.
- Before the PR: `pnpm run lint`, `pnpm run format`, and `pnpm run test:ci` (or `pnpm test`).
  Label the PR `drizzle-e2e`.

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

## What shipped (2026-09-25)

Everything in the plan landed. Where it went beyond or differs from the plan:

- **Core fixes (step 0):** the three error texts now name all three dialects; `refine.ts` uses `ColBaseFlag`.
- **Stray modifier keys, found while building mysql, fixed in all three dialects.** A `const` type parameter gets
  no excess-property check, so `varchar({length: 10, autoincrement: true})` and
  `Varchar<{length: 10; autoincrement: true}>` compiled and the stray flag changed the models. Every builder and
  column type now constrains its props with `Only<P, Allowed>` (`packages/drizzle-orm/next/columns.ts`), and each
  builder lists its name overloads before its props overload, so a plain name never pays for the check. pg budgets
  rose as a reviewed exception (five mixed: types 539 to 683, builders 971 to 1160; plain columns unchanged); every
  variant measured is in `TYPE-COST.md` "Stray modifier keys". Pinned with `@ts-expect-error` in each dialect's
  `test/next/type-pins.stub.ts`.
- **A shipped bug, fixed in its own commit:** `RtColumnRecorder.generatedAlwaysAs` dropped its `{mode}` argument,
  so a stored generated column reached drizzle as virtual on mysql and sqlite (shipped and next roads). Tests in
  both packages' `test/index.spec.ts` and the sqlite next parity test.
- **toDrizzle routing:** mysql and sqlite send any recorded value (table, view, schema handle, index entry) to the
  shipped runtime and treat anything else as the marker form, so a standalone index entry is never mistaken for
  marker options.
- **mysql:** `mysqlEnum` lives in `helpers.ts` and is also in `mysqlColumnHelpers`; `mysqlTableCreator` and
  `mysqlSchema` wrap the shipped recorders with resolved columns, so `toDrizzle(schema)` still works.
- **sqlite:** `sqliteTableCreator` returns a named `SqliteTableCreatorFn` interface (an inferred one failed
  declaration emit with TS4023); the `view` alias is kept.
- **Nested marker calls:** the fix had landed, so `tableFromType<T>()` is used inline inside `toDrizzle({tables})`.
- **Fuzz (step 3):** the dialect-free core is `packages/drizzle-orm/test/tableSpecCore.ts` (`specTools(dialect)`);
  pg output is byte-identical over 300 seeds. Each dialect's `test/tableSpecShared.ts` holds its kinds, type names,
  projection and views. In-process fuzz soaked at 2000 tables x 3 seeds per dialect; resolver fuzz at
  `MION_FUZZ_ITER=40` x 3 seeds. Negative controls fired: a next recorder skipping `notNull`, the shipped recorder
  dropping `unique`, the next reader ignoring db names, and `primaryKey` removed from the not-null rule.
- **Measure (step 4):** `@mionjs/type-budget` now depends on the mysql and sqlite packages; the report has a
  dialect column. mysql five mixed: 712 types / 1184 builders; sqlite: 658 / 1058.
- **Drizzle-free authoring:** the sqlite case compiles with Node's types, because sqlite's blob buffer mode is
  Node's `Buffer`, as drizzle types it.
- The shipped road is unchanged: `drizzle-translate --to-types` reports 21 type errors before and after, both roads.

## Follow-up in the same PR: the three dialects test the same things (2026-09-26)

A review found pg's `next/` tests thinner than mysql's and sqlite's, and the type-budget files testing pg only in places. The three dialects now carry one test set:

- **Parity check:** `packages/drizzle-orm/test/nextDialectParity.spec.ts` compares every describe / it title, exported `*Pins` tuple and `@ts-expect-error` reason in each dialect's `test/next/typeTables.spec.ts`, `test/next/type-pins.stub.ts`, `test/next/drizzleTypeSource.integration.spec.ts` and `test/tableEquality.fuzz.spec.ts`. An unmarked item must exist in every dialect; a dialect-only item is marked `only <dialects>:` (titles, reasons) or `Only<Dialects>_` (pins) and must exist in exactly those. The dialect list is one `DIALECTS` array. Negative controls: a renamed title, an unmarked extra test and a wrong prefix all fail.
- **pg `next/` gained** `pgTableCreator`, `pgSchema` (table, view, materializedView, enum, sequence), the query-builder refusal overloads for `pgView` / `pgMaterializedView`, every shipped `toDrizzle` form (enum, schema, sequence, role, policies, standalone index) routed by a recorded-value check, and `PgEnumObjectCol`. mysql gained the `mysqlView(name)` refusal; both re-export the view types.
- **Fuzz:** each dialect projects every drizzle field it has (generated, identity, uniqueName, composite primary keys, fk onUpdate, index options), generates its own modifiers (pg identity, array, generated; mysql generated; sqlite autoIncrement primary key, generated), and runs a next/ view surface; pg reads `MION_FUZZ_ITER`. This changed what pg seeds generate. Soaked at 2000 x 4 seeds in process and 40 x 4 through the resolver.
- **Type budget:** `columnFormats.compile.test.ts` runs the same ten shapes and twin pins for all three; `declarationEmit.test.ts` the same twelve cases; `drizzleFreeAuthoring.test.ts` one next/ template plus each dialect's own features.
- **Left for the switch** (old-system tests only pg has, convert tests, two shipped bugs found on the way: mysql index options typed before `.on()`, and `pgSchema().enum`'s object form keeping the object as `enumValues`): listed in the switch spec.
