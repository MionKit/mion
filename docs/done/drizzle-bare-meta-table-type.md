---
type: chore
spec: full-plan
status: done
created: 2026-08-30
---

# The slim table type becomes the meta itself

## Problem

A slim drizzle table names its columns twice, and wraps the useful half in a symbol:

```ts
// packages/drizzle-orm-pg-core/src/table.ts:58
export type PgBuilderTable<TName extends string, Cols extends object, Extras extends readonly object[] = []> = Cols & {
  readonly [rtTableKey]: RtTableMetaWithExtras<TName, Cols, Extras>;
};
```

The `Cols &` arm makes `table.column` a property. The meta under the symbol key is what
every reader actually uses (`ColsOf`, the models, `refineTableType`, `toDrizzle`, the
reflection bridge). The symbol wrapper itself exists only to say "a table lives below".

The meta IS the table, so the type should just BE the meta, with its own brand inside it.

Measured on the real packages (`packages/drizzle-orm/TYPE-COST.md`): about 5 instantiations
a table, 86 across the whole model pipeline, and 7-8% off the generated reflection cache
module. **That saving is small and that is understood. It is not the goal.**

## The goal is removing complexity

Every simplification the new shape allows is in scope. A change that lands the shape while
leaving the old scaffolding standing has missed the point. Judge the result by how much
smaller and more obvious the table types are, not by the budget delta.

- **The intersection arm**, gone from five aliases (`RtTable`, `PgBuilderTable`,
  `PgTableWithRLS`, `MysqlBuilderTable`, `SqliteBuilderTable`) and its view twin.
- **The symbol indirection**, in 12 places. `T[typeof rtTableKey]['columns']` becomes
  `T['columns']`; in the bridge, `memberNamed(graph, '@rtTableKey').child` becomes reading
  the root's own members.
- **The two near-identical meta interfaces.** `RtTableMeta` and `RtTableMetaWithExtras`
  (`table.ts:28-40`) differ by one member, and the comment explaining why they are separate
  is about paying for an intersection at the meta key, which no longer exists. Evaluate
  merging them into one with `Extras = []` defaulted.
- **The `PgTable` / `PgBuilderTable` alias split**, three times over. The comment at
  `table.ts:42-47` justifies it by declaration emit printing the columns record twice when
  the same `Cols` fills two slots. With one column position left, re-test that: if
  `TypedCols<AlreadyNormalized>` still takes its wholesale branch, the pair may collapse to
  one alias per dialect. Verify with `declarationEmit.test.ts` rather than assuming.

## What two spikes already settled

- **The blocker.** A bare meta carries no sentinel, so nothing can tell a table from any
  other object. Prototyped: 13 of `typeTables.spec.ts`'s 20 cases fail with "the reflected
  type is not a table". `buildRtTableFromGraph` finds a table by its `@rtTableKey` member
  (`fromType.ts:333`) and the Go convert program does the same (`drizzle.go:96,122,1288`).
- **The answer.** Moving the brand INSIDE the meta costs **zero** instantiations: 920 with
  or without it, measured both as a plain string-literal member and as a symbol member, on
  a 5-column and a 20-column table.

## The brand carries the dialect, and that closes a real hole

All three dialects' `toDrizzle` take the same dialect-blind `AnyRtTable`, so this compiles
today and fails at run time:

```ts
import {toDrizzle} from '@mionjs/drizzle-orm-mysql-core/drizzle';
toDrizzle(somePgTable);   // TypeError: dzMy.pgTable is not a function
```

`materializeRtTable` replays the table's OWN captured `buildTable` closure against whichever
dialect's context it was handed, so a pg table run through mysql's `toDrizzle` reaches for
`context.ns.pgTable` and finds nothing. A dialect-tagged brand makes that a compile error,
in every dialect's `toDrizzle` and `tableFromType` at once. That is worth more than the
instantiations this change was started for.

## Plan

**1. The table type becomes the meta, branded from inside with its dialect.**

```ts
// packages/drizzle-orm/src/table.ts:28-46
export interface RtTableMeta<TName extends string, Cols, Dialect extends string = string> {
  readonly [rtTableBrand]?: Dialect;   // 'pg' | 'mysql' | 'sqlite' | ...
  name: TName;
  columns: Cols;
}
export type AnyRtTable = RtTableMeta<string, Record<string, AnyRtColumn>>;
export type TableNameOf<T extends AnyRtTable> = T['name'];
export type ColsOf<T extends AnyRtTable> = T['columns'];
```

A NEW symbol, not the existing `rtTableKey`: that one already means "the runtime state" on
the value, and reusing it for "I am a table" on the type would give one symbol two jobs.
Symbol-keyed rather than a plain `dialect` member so detection stays nominal (any object
could have a `dialect` field); optional, matching the house sentinel convention in
`typeColumns.ts`. Optional still rejects the cross-dialect call, because `'pg' | undefined`
is not assignable to `'mysql' | undefined`.

Each dialect pins its own tag, and its `toDrizzle` / `tableFromType` narrow to it instead of
the shared `AnyRtTable`. Pg's `enableRLS()` stays an extra member in the same object, never
a second intersection arm (+4 per table, already measured).

**2. The runtime object does NOT change.** `createRtTable` keeps returning
`{...columns, [rtTableKey]: runtime}`, because `extraConfig((t) => [index().on(t.name)])`
and `references(() => teams.id)` read those properties at run time. Only what the TYPE
promises changes. State that in the code: the slim table type is a type-level DESCRIPTOR,
not a mirror of the runtime object.

**3. Property access gets an accessor.** Prototyped, identity at run time:

```ts
export function cols<T extends AnyRtTable>(table: T): ColsOf<T> {
  return table as unknown as ColsOf<T>;
}
// references(() => teams.id)  ->  references(() => cols(teams).id)
```

**4. Views get the same treatment** (`view.ts:26-35`) with their own brand, so the two stay
symmetrical and `toDrizzle`'s overload set can still tell a table from a view.

### Files to change

**Types (the core of it).** `packages/drizzle-orm/src/table.ts:28-46` and `view.ts:26-35`;
the three dialect `src/table.ts` aliases; the three `src/drizzle.ts` `toDrizzle` overload
sets and `tableFromType` signatures, narrowed to their own dialect tag; `refine.ts:56`
(`RefinedTable`), which must now thread the dialect through. `models.ts` needs no edit, it
reads through `ColsOf`.

Note while there: `RefinedTable` builds `RtTable<...>`, which drops `extras`. Pre-existing;
carry it over unchanged, do not silently fix it.

**Detection.** `fromType.ts:333` stops descending into the sentinel's child and reads
`name` / `columns` / `extras` off the root, after asserting the brand is present. It can
now also check the reflected dialect against the bridge it was called through.

**Go.** Four sites, all in `ts-go-runtypes/internal/convert/drizzle.go` — the constant at
`:44`, the two `typeHasSentinel` guards at `:96` and `:122`, and `member(root, sentinelTable)`
at `:1288`. Nothing outside `internal/convert/` matches the sentinel. The emit paths keep
printing `DB.PgTable<'t', {...}>` unchanged, but the builders road prints
`references(() => parents.id)` (`:773` parse, `:959` emit) and must learn `cols(...)`.

**Test harnesses that BUILD synthetic graphs** — these hand-roll the wrapper shape:
`packages/drizzle-orm/src/fromType.spec.ts:50` (`tableNode`) and
`packages/drizzle-orm-pg-core/test/tableSpecShared.ts:441` (`syntheticTableGraph`), whose
`renderTableBuilders` also emits `foreignColumns: [parent.id]` at `:347`.

**Call sites needing `cols()`** — 16 in the dialect specs, 7 assertions in
`drizzle_test.go`, 3 in `packages/examples/src/drizzle/`, 1 in
`container/website/sites/mion/content/03.drizzle-orm/03.indexes-constraints.md:43`.

## Tests

- The three dialect `index.spec.ts` + `typeTables.spec.ts` (the two-roads oracle), and
  `fromType.spec.ts` for the new graph shape.
- **New:** a per-dialect negative pin that `toDrizzle` and `tableFromType` REJECT another
  dialect's table at compile time. This is the hole the change closes, so it needs its own
  test, not just a passing suite.
- `drizzleTypeSource.integration.spec.ts` — real resolver over generated type source. Its
  Marker rule pair (static `getRunTypeId<T>()` vs the value probe) must still agree, per the
  Marker test coverage rule in [ts-go-runtypes/CLAUDE.md](../../ts-go-runtypes/CLAUDE.md).
- `tableEquality.fuzz.spec.ts` — `pnpm rtx core fuzz drizzletypes`.
- Go: `go -C ts-go-runtypes test ./internal/...`.
- Budgets: `pnpm --filter @mionjs/type-budget test`. Every budget should DROP; commit the
  regenerated reports. Add a case pinning that the dialect brand is free (the exact
  `[rtTableBrand]?: 'pg'` spelling was not measured on its own, only the two shapes it
  combines, so confirm it rather than assume it).

## Docs

`container/website/sites/mion/content/03.drizzle-orm/` — the constraints page teaches the
drizzle `references(() => teams.id)` spelling and needs the accessor. Check the rest of that
section for the same pattern. The three `packages/examples/src/drizzle/` files the docs
import compile under the root typecheck, so they fail CI if missed.
`packages/drizzle-orm/CLAUDE.md` and the drizzle-slim-schemas skill both show table code.

## End-to-end

Five lanes over four images (`scripts/release/drizzle-e2e.mjs:36`,
`scripts/container/image.mjs:70`):

```bash
pnpm rtx core drizzle-translate            # host only, both roads, no container
pnpm rtx core drizzle-translate --to-types
pnpm rtx container pull drizzle-pg drizzle-mysql drizzle-sqlite drizzle-cloudflare
pnpm rtx release drizzle-e2e               # pg, mysql, sqlite, d1, durable
```

This is the gate that matters: it re-translates drizzle's own suites with
`ts-runtypes drizzle-migrate`, converts them again with `convert --to type`, and runs all
three trees against real databases. A schema with a foreign key goes straight through the
`references(() => cols(x).id)` change, so a green run is what proves the emit path.

## Out of scope

The runtime slim table object. `refineTableType` dropping `extras`. Any change to how
columns themselves are typed.

## Done when

`pnpm test`, `pnpm run lint`, the Go suite and all five e2e lanes are green; a cross-dialect
`toDrizzle` is a compile error with a test pinning it; the budget reports are regenerated
and lower; `TYPE-COST.md` is rewritten so it records the shipped shape rather than arguing
against it.

And, because it is the actual goal: each of the four simplifications listed at the top has
either been taken or has a measured reason recorded for why it could not be. The table
types should read as plainly at the end as the idea behind them.


## What shipped

All of it, plus one thing the spec did not anticipate and minus one it asked to evaluate.

### The four simplifications

1. **The intersection arm: gone**, from all five aliases and the view twin. A table type is
   now `{[rtTableBrand]?: 'pg'; name; columns; extras}` and nothing else.
2. **The symbol indirection: gone.** `ColsOf<T>` is `T['columns']`; the bridge reads
   `name` / `columns` / `extras` off the graph root.
3. **The two meta interfaces: merged.** One `RtTableMeta<TName, Cols, Extras = []>`.
4. **The `PgTable` / `PgBuilderTable` split: COLLAPSED.** One type per dialect. Measured
   first at about +2 a table on the builder road (it now runs its columns through
   `TypedCols`, a wholesale pass-through it used to skip) and taken anyway: two shapes for
   the same table, one per road, cost more in complexity than the instantiations are worth,
   and nothing downstream has to know which road declared a table any more. The type road
   got slightly cheaper in exchange.

### The dialect brand cost real work to make free

The first spelling threaded the dialect as a type parameter on the core meta: **+4 per
table**. The second declared it in core AND narrowed it per dialect: **+9**. What shipped
declares it once, as a fixed literal on a per-dialect marker interface
(`RtTableBrand<'pg'>`) that the dialect table interface extends, and measures at **zero**.

### The budgets went UP, not down

The spec expected every budget to drop. Four type-road cases rose by 1-2 instead:

| Case | Was | Now |
| ---- | --: | --: |
| type road, 5 mixed columns | 967 | 968 |
| type road, 20 plain columns | 1340 | 1341 |
| pre-branded, 20 plain columns | 314 | 316 |
| type road, wide vocabulary | 1169 | 1170 |

The spike that predicted -5 measured a hand-written three-line select model; against the
real `InferSelectModel` the shape is very slightly more expensive. The brand is not the
cause (it measures at zero). Reviewed and accepted by the owner as minimal, with the reason
recorded beside each budget. Everything else, `refineTableType` and the whole 13077
model pipeline included, is at or under its old number.

### What the e2e lane caught that no unit test did

`drizzle-migrate` splits a table into a recorder plus its `toDrizzle` half, and drizzle's
own suites declare a standalone index over another table's column,
`index('i').on(users.name)`, which the split points at the recorder. That reference needed
`cols()` too, in a third emit path the spec did not name (`internal/drizzlemigrate`). Found
by `rtx core drizzle-translate` over the real suites; fixed in its own commit.

### One thing to know about the shape

`name`, `columns` and `extras` are plain keys on the table type now, so on a table with a
column called `name` the type-level `table.name` is the table's DB name, not the column.
`cols(table).name` is the column. Before, the columns were the top-level members and this
could not happen. It is coherent and it is what the accessor is for, but it is a real
difference for anyone porting code that read a column off a table directly.

### Dead scaffolding the shape orphaned

- `RtTable` and `RtView`: pure `= RtTableMeta<...>` aliases with nothing calling them once
  refine stopped rebuilding a table through `RtTable`. Removed.
- `PgBuilderTable` / `MysqlBuilderTable` / `SqliteBuilderTable`: gone with the collapse.
- **The intersection flattening, on BOTH sides.** `membersOf` in `fromType.ts` and
  `properties` in `internal/convert/drizzle.go` each flattened intersection arms because a
  table used to be `Cols & {meta}`. Probed by making the branch throw: 243 unit tests, a
  wide `drizzletypes` fuzz and all 228 tables of drizzle's own suites never reach it. Both
  removed, and `reflectedKinds.intersection` with them.

### Also changed, beyond the spec's list

- `refineTableType` now carries `extras` and the dialect through, where it dropped `extras`
  before. The spec said to carry that quirk over unchanged; the dialect brand made it
  load-bearing (a refined table that loses its dialect cannot reach any `toDrizzle`), and
  fixing `extras` in the same line was free. Called out rather than done silently.
- Views got the identical treatment with their own `RtViewBrand`, so `toDrizzle`'s overload
  set can still tell a table from a view.

### The five e2e lanes, against real databases

All green. Each reports parity with drizzle's untranslated control on every vendored test,
no new type errors on either road, and full manifest coverage.

| Lane    | control            | translated         | type road          |
| ------- | ------------------ | ------------------ | ------------------ |
| pg      | 183 passed         | 191 passed         | 191 passed         |
| mysql   | 177 passed, 1 fail | 181 passed, 1 fail | 181 passed, 1 fail |
| sqlite  | 132 passed, 4 fail | 137 passed, 4 fail | 137 passed, 4 fail |
| d1      | 127 passed, 9 fail | 127 passed, 9 fail | 127 passed, 9 fail |
| durable | green              | green              | green              |

The failures are drizzle's own, present on the untranslated control; the lane asserts that
every vendored test has the SAME outcome on all three trees, which held everywhere. The
extra counts on the translated and type roads are each lane's own addendum.
