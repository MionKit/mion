# Type-instantiation cost of the slim column and table types

Every consumer's editor pays these numbers on every keystroke, so this file records what
has been measured, to keep the next person from re-deriving it.

**The live numbers are not here.** They are measured by
[`packages/type-budget/test/typeRoad.compile.test.ts`](../type-budget/test/typeRoad.compile.test.ts)
and written to [`reports/type-road.md`](../type-budget/reports/type-road.md) on every run,
with budgets that may only ever be lowered. This file is the reasoning: which designs were
tried, which won, and why. A figure quoted below is a snapshot for the argument it makes,
not a current value, and the very first section says what happens when someone treats one
as current.

## The correction: normalization is the cost, modifiers are a small slice of it

An earlier spike recorded that "966 of the type road's 1287, three quarters of it, is
turning `Varchar<'name', {length: 100}> & NotNull` into a branded column", and read that
as the intersection of the modifier markers. A whole change was specced on it. Re-measured
on the tree of 2026-08-30 (TypeScript 6.0.3, drizzle-orm 0.45.2), the split is nothing
like that. Five columns, `InferSelectModel` consumed:

| How the table is written                                      | Net instantiations |
| ------------------------------------------------------------- | -----------------: |
| builder road, `pgTable('users', {...})`                       |                646 |
| type road, `Varchar<'name', {length: 100}> & NotNull` and co. |               1488 |
| type road, the SAME columns with no modifiers at all          |               1301 |
| pre-branded columns, no normalization at all                  |                375 |

Normalization is 1113 of the type road's 1488. Of that, the modifiers are **187**, about a
sixth; the other **926** runs whether a column carries a modifier or not. So the earlier
reading attributed the whole of normalization to one part of it.

That is why the numbers now live in a suite and not in this file. A stale figure here sent
a change down a road it could never have paid off on.

## Modifiers as props: worthless on its own, decisive when it deletes NormalizeCol

Read this section whole before quoting either half of it. The first measurement here was
reported as a rejection, and that was wrong. It is the clearest example in this file of the
third trap at the bottom: measuring the change as SPECCED instead of measuring what the
change makes possible.

The idea: stop spelling modifiers as separate interfaces the checker has to merge, and let
them arrive as one literal object the column type already carries.

```ts
// markers, today
Varchar<'name', {length: 100}> & NotNull;
// props
Varchar<'name', {length: 100; notNull: true}>;
```

### Shape A, props with `NormalizeCol` kept: no win

This is the change exactly as its spec described it, removing `ColModsOf` (the mapped type
that re-materializes the merged intersection) and leaving the rest of normalization alone.
Five mixed columns, and the same five with the modifiers dropped so the empty-modifier cost
shows:

| Shape                                       | 5 mixed | 5 with no modifiers |
| ------------------------------------------- | ------: | ------------------: |
| markers, today                              |    1488 |                1301 |
| props in one bag with the builder config    |    1488 |                1425 |
| props carried inside the column spec object |    1527 |                1443 |

Nothing on the case it was designed for, and a loss of about 124 on modifier-free columns,
because the column type then carries a mods member everywhere instead of only where a
marker put one. Modifiers only cost 187 in total, so that was always the ceiling.

### Shape B, props that let the alias BE the branded column: SHIPPED, -17 to -25%

The number above prices the wrong thing, and stopping there was the mistake. Props are not
worth having for what they remove from `NormalizeCol`. They are worth having because they
let `NormalizeCol` be deleted.

A type-road column is a spec CARRIER that `NormalizeCol` converts into a branded column
afterwards, once per column, through `TypedCols`'s mapped pass. Everything that conversion
extracts is already a type parameter inside the column alias. Once the modifiers are a type
parameter too, the alias can expand straight to the branded column, `TypedCols` takes its
existing wholesale pass-through branch, and the whole normalization pass is gone. An
intersection cannot do this: it can add facts, it cannot flip a type parameter on the
column it intersects with. That is the only reason props are needed.

What actually shipped, measured on the real packages before and after:

| Case                       | Markers | Props, no NormalizeCol | Change |
| -------------------------- | ------: | ---------------------: | -----: |
| 20 plain columns           |    2116 |                   1595 |   -25% |
| 5 mixed columns            |    1258 |                   1045 |   -17% |
| 5 mixed + insert model     |    1895 |                   1673 |   -12% |
| wide vocabulary, 7 columns |    1560 |                   1246 |   -20% |
| builder road, any shape    |     646 |                    646 |      0 |

The wide case is the one to trust: serial with intrinsic base flags, enum text, identity,
array, `$type`, unique, defaultNow. Both roads are pinned against each other with `Equal<>`
on the select AND the insert model, on the narrow case and the wide one, so this is not a
cheaper-but-lossy shape.

The cost of it is the one-object spelling: config keys and modifier calls share a props
object, so the runtime bridge and the Go convert program each split it by a list of the 18
modifier names. Three gates keep that honest against the generated manifests
(`colMods.spec.ts`, `TestDrizzleModNamesMatchManifests`, and each dialect's
`manifest-coverage.spec.ts`), including a check that no builder config key is ever named
like a modifier.

#### Two variants measured and rejected

**An empty-modifier fast path** (`[keyof Mods] extends [never]`, skipping the flag
derivations when a column carries none) saves about 18 a column with no modifiers and costs
about 16 on one that has some:

| Case                           | Props | + fast path |
| ------------------------------ | ----: | ----------: |
| 20 columns, none modified      |  1443 |        1083 |
| 20 columns, half modified      |  1772 |        1742 |
| 5 mixed columns (all modified) |  1022 |        1112 |
| wide vocabulary (all modified) |  1200 |        1310 |

Real schemas put `notNull` on most columns, so it loses where it matters. It only looks good
on the all-plain case.

**Splitting the props inside the type** (each alias picking its own config keys out with
`Pick`, so neither reader would need the name list) costs 48 to 57 per CONFIGURABLE column,
which eats more than half the win: 5 mixed 1022 to 1192, wide 1200 to 1394. The name list in
two readers is the cheaper price.

### And most of what is left is not derivation at all

Before anyone chases the pre-branded floor: twenty type-road columns cost 2116 with
distinct db names and 767 when every column is nameless (both measured before the props
change, so read the ratio, not the absolutes). The builder road's twenty columns are twenty
references to ONE type, because the db name is a runtime argument; the type road's are
twenty separate instantiations, because the name and config ride in the type. That is the
price of being reflectable and it is not removable while `tableFromType` and
`ts-runtypes convert` exist. Most of the gap the suite still shows is that, not work anyone
can delete.

## Accepted: four changes to the normalization itself

Measured one at a time against the real packages. Together they took the type road down
about 16% on a five-column table and 21% on a twenty-column one, with the builder road
byte-identical (it never enters `NormalizeCol`).

| Case                              | Before | After | Change |
| --------------------------------- | -----: | ----: | -----: |
| type road, 5 mixed columns        |   1488 |  1258 |   -15% |
| type road, 5 mixed + insert model |   2125 |  1895 |   -11% |
| type road, 20 plain columns       |   2693 |  2116 |   -21% |
| builder road, any shape           |    646 |   646 |      0 |

1. **The key flags became a lazy member.** `RtTypedColumn` used to pass
   `ModKeyFlags<Spec, Mods>` as a type argument to `RtColumnKeyBrand`, which instantiates
   it eagerly on every declared column. Only mysql's `$returningId()` ever reads those
   flags. As a property type inside the generic interface, the checker computes it when it
   is read and not before. Worth about 8 per column.
2. **The spec and the mods are extracted once and threaded down.** `NormalizeCol` called
   `ColSpecOf<C>` and `ColModsOf<C>` five times between them, and `BaseFlag` built a mapped
   type (`{[K in Key]: true}`) per probe. Every derivation now takes the extracted pair.
3. **One conditional pulls both out.** `ColSpecOf` and `ColModsOf` each computed `keyof C`;
   a single `C extends {[rtColSpecKey]?: infer Spec; [rtColModsKey]?: infer Mods}` does it
   once. This is the biggest of the four on tables that carry modifiers.
4. **The intrinsic flags became a name union.** A column type used to instantiate
   `{notNull: false; hasDefault: false; primaryKeyHasDefault: false; autoincrement: false}`
   on every column to say it had no intrinsic flags. It now names the flags it does have
   (`'notNull' | 'hasDefault'` for the serial-likes, `never` for everyone else), and the
   three probes read it with `'notNull' extends Base`. Worth about 5 per column on a wide
   table; slightly negative on a narrow one, kept because width is what scales.

## Accepted: reading the model flags off one payload

`InferSelectModel` and friends read each column's four brand flags through four separate
`C extends RtColumnBrand<infer ...>` probes. `RefineCols` did the same, and so did the
`toDrizzle` config synthesis in all three dialects. Matching the payload ONCE
(`C extends {[rtColumnKey]?: infer Brand}`) and indexing into it helps BOTH roads, which
nothing else in this file does:

| Case                              | Before | After | Change |
| --------------------------------- | -----: | ----: | -----: |
| builder road, 20 plain columns    |    465 |   343 |   -26% |
| pre-branded, 20 plain columns     |    436 |   314 |   -28% |
| builder road, 5 mixed columns     |    646 |   568 |   -12% |
| type road, 20 plain columns       |   1595 |  1340 |   -16% |
| type road, 5 mixed + insert model |   1673 |  1434 |   -14% |
| model pipeline, whole chain       |  13328 | 13077 |    -2% |

It stalled on the first attempt because the pipeline suite budgets each STEP, and this moves
work between steps: every shape of it left the cumulative total lower while pushing at least
two per-step deltas over budgets that are one-way downward. The fix was to convert the OTHER
two readers as well, so the layers that were absorbing the moved work got cheaper too, and to
give the suite a TOTAL budget (`PIPELINE_TOTAL_BUDGET`) beside its per-step ones. Per-step
deltas cannot see work crossing a layer boundary in either direction; the total can.

One step still rises by 2 (step 6, where drizzle's own generics consume the synthesized
column config). It is the only reviewed budget increase in that suite, recorded where the
budget lives.

## Rejected: dropping the columns from one of the two places they appear

A slim table names its columns twice, and it keeps reading like waste, so this section
answers it with all four axes measured rather than one:

```ts
export type PgBuilderTable<TName extends string, Cols extends object, Extras extends readonly object[] = []> = Cols & {
  readonly [rtTableKey]: RtTableMetaWithExtras<TName, Cols, Extras>;
  //                                                  ^^^^ the same Cols again
};
```

The two positions are not two copies. `Cols` is instantiated once and both positions
reference that one type, so the second mention is a reference, not work. What follows
prices the second mention on every axis a consumer can feel.

### The four shapes, one identical select model over each

The shape is the ONLY thing that varies below: each row runs the same three-line select
model over whatever its `ColsOf` returns, so the model machinery cancels out. The
`InferSelectModel` anchor row is the real thing, for scale.

| Table shape                                          | 5 mixed | 20 plain |
| ---------------------------------------------------- | ------: | -------: |
| real `InferSelectModel` over `PgTable` (anchor)      |     966 |     1339 |
| `Cols & {[key]: {name, columns, extras}}` (today)    |     925 |     1298 |
| `{[key]: {name, columns, extras}}` (no `Cols &`)     |     922 |     1295 |
| `{name, columns, extras}` (the meta AS the table)    |     920 |     1293 |
| `Cols & {[key]: {name, extras}}` (no meta `columns`) |    1021 |     1634 |

Deleting the `Cols &` arm is worth a FLAT 3 instantiations, on a five-column table and a
twenty-column one alike. That is the whole prize, and it does not grow with the schema.

Deleting the meta's `columns` instead is the expensive direction, and it gets worse as
the table widens (+26% at twenty columns): `ColsOf` stops being an indexed access and
becomes a mapped pass that has to strip the symbol key off every member.

### Nothing prints it twice either

The `Cols &` arm was suspected of doubling what a consumer reads. It does not. TypeScript
keeps the alias in all three surfaces, so the columns record appears once wherever a
developer or a build sees it:

| Surface         | What a 3-column type-road table shows                         |
| --------------- | ------------------------------------------------------------- |
| hover           | `const t: PgTable<"users", Cols>` (36 chars)                  |
| error text      | `Type 'PgTable<"users", Cols>' is not assignable to 'string'` |
| emitted `.d.ts` | the alias with its type arguments, columns printed once       |

`declarationEmit.test.ts` already pins the emit half of that.

### Where the duplication IS real: the reflected graph

The one axis that does cost something is reflection, and it is the axis none of the type
budgets watch. `tableFromType<T>()` reflects the WHOLE table type, and
`buildRtTableFromGraph` then reads `graph[@rtTableKey].columns` and nothing else. The
top-level arm is reflected and never read.

Measured through the real resolver, one type-road table per fixture:

| Columns | cache module, today | cache module, no `Cols &` arm |     |
| ------: | ------------------: | ----------------------------: | --- |
|       3 |               4 967 |                         4 547 | -8% |
|      10 |              13 565 |                        12 548 | -7% |
|      20 |              25 856 |                        23 987 | -7% |

Even here it is 7%, not the doubling the source reads like: the resolver already shares
the column subtrees between the two positions, and what duplicates is one property-member
wrapper per column (about 2 nodes each). Pruning it would mean the resolver emitting a
graph that no longer describes the type it was asked about, for 7% of a build artifact.
Not worth the special case.

### Both variants prototyped against the real packages

The two ways to drop the arm are NOT equivalent, and the difference only shows once they
are built. Both were prototyped on the real four packages and measured through the whole
model pipeline, table to `initClient` to a live `toDrizzle` query.

**Bare meta**, `PgBuilderTable<N, C, E> = RtTableMetaWithExtras<N, C, E>`, the table type
being the meta itself. It kills the type road outright: 13 of `typeTables.spec.ts`'s 20
cases fail with "the reflected type is not a table". `buildRtTableFromGraph` finds a table
in the reflected graph by its `@rtTableKey` member (`fromType.ts`), and the Go convert and
migrate program recognises a table declaration the same way
(`typeHasSentinel(declared, sentinelTable)`, `internal/convert/drizzle.go`). A bare meta
carries no sentinel, so neither can tell a table from any other object. It also makes
`AnyRtTable` structural (`{name, columns}`), which is `RtViewMeta`'s shape too, so the
`toDrizzle` overload set can no longer keep tables and views apart.

**Meta only**, keeping the symbol key and dropping just the `Cols &` arm. This one works:
234 of 234 drizzle tests pass (the runtime object is untouched, only the type stops naming
the columns), and it beats bare meta on cost as well.

| Pipeline step       | today | meta only | bare meta |
| ------------------- | ----: | --------: | --------: |
| 1 slim table + row  |   433 |       428 |       432 |
| 2 refineTableType   |  1141 |      1130 |      1107 |
| 3 `Infer*` models   |   578 |       578 |       573 |
| 4 mion route api    |   533 |       533 |       533 |
| 5 `initClient`      |  2540 |      2540 |      2540 |
| 6 db query          |  7852 |      7782 |      7842 |
| **whole chain**     | 13077 | **12991** |     13027 |
| downstream consumer |  1513 |      1499 |      1491 |

So the honest whole-app figure for the better of the two is **86 instantiations out of
13 077, 0.66%**, plus the 7% off the generated cache module. Nothing downstream of the
models moves: the route api, the client and five sixths of the db query step are drizzle's
own generics and mion's, and they never see the table's shape.

### What implementing the meta-only variant costs

The type errors it produces are all one thing, `table.column` on a slim table, and they
have a mechanical fix: a `cols()` accessor, identity at runtime because the slim table
object really does carry the columns as properties.

```ts
export function cols<T extends AnyRtTable>(table: T): ColsOf<T> {
  return table as unknown as ColsOf<T>;
}
// references(() => teams.id)  ->  references(() => cols(teams).id)
```

Prototyped end to end: the four table aliases, the accessor, and 16 rewritten call sites
took the workspace back to zero type errors with all 234 tests still green. What that
number hides is where the same pattern lives outside this repo:

- `ts-runtypes convert --to builders` EMITS `references(() => parents.id)` verbatim
  (asserted in `internal/convert/drizzle_test.go`), so the converter and its golden
  fixtures have to learn the new spelling, and every schema the drizzle-e2e lane migrates
  from drizzle's own suites goes through it.
- The published examples and `03.drizzle-orm/03.indexes-constraints.md` teach the drizzle
  spelling.
- Every consumer who already wrote a foreign key has the same edit to make.

### Why it stays

That last point is the whole argument, and it is not about instantiations.
`references(() => teams.id)` and
`foreignKey({columns: [t.teamId], foreignColumns: [teams.id]})` are how a drizzle schema
is written, and "drizzle-identical call shapes" is what these packages sell.
`references(() => cols(teams).id)` is not that. Nor is anything missing today that the
change would add: `ColsOf<T>` and the `Infer*Model` family already recover the columns
from the meta, so there is no absent `InferCols` the arm is standing in for.

It would also split the two roads. `PgTable<Name, Cols>` resolves to the SAME
`PgBuilderTable` the builders return, which is what lets the models, `refineTableType` and
`toDrizzle` take one code path for both.

So: 0.66% of the whole chain and 7% of one build artifact, against a breaking change to
the API the packages exist to mirror. Keep the shape. If the trade is ever reconsidered,
reconsider the meta-only variant and not the bare meta one, and start from the prototype
recipe above.

### A new dialect changes none of this

A fourth dialect (D1) should copy the pg/mysql/sqlite alias pair verbatim rather than
factoring the three into a shared base. A shared base with the dialect's own extras
intersected on top costs +4 per table over spelling the extra member inside the same
object as the meta key, which is what the packages already do and what the comment on
`PgBuilderTable` records.

## Rejected: moving the column metadata into a flat "params bag"

The idea: a column type stops carrying its metadata in generic positions
(`RtPgColumn<Data, NotNull, HasDefault, InsertExcluded>`) and carries it as props on one
object instead, the way a runtypes `TypeFormat` does. Four shapes were measured. All four
lost.

### Flattening the columns to bags, measured against the real packages

Keep today's column brand, but flatten each column to `{data, notNull, hasDefault,
insertExcluded}` once per table and let the models read those props by indexed access
instead of four `infer` conditionals per column. This is the only variant that could be
measured with no prototype stand-ins on either side, so it is the one to trust.

| Columns | today's `Infer*` | bag models |      |
| ------: | ---------------: | ---------: | ---- |
|       5 |              888 |        897 | +1%  |
|      10 |             1078 |       1175 | +9%  |
|      20 |             1448 |       1727 | +19% |
|      40 |             2198 |       2835 | +29% |

Worse, and worse as the table widens. The mapped pass that builds the bags costs the same
conditionals the models were doing, and then the models pay an extra indexed access on
top. The sharing never pays for the object.

(The payload change in the section above is NOT this one: it adds no per-table mapped
pass, it reads the brand member each column already carries.)

### Full ColumnFormat, modifiers merged by a mapped type

`Merge<P, {notNull: true}>` per builder call and per modifier. Measured against the real
`pgTable`:

| Case                       | today | ColumnFormat |
| -------------------------- | ----: | -----------: |
| declare a 5-column table   |   314 | 1013 (+223%) |
| + select model             |   501 | 1233 (+146%) |
| + select and insert models |  1067 |  1606 (+51%) |
| 40 columns, both models    |  2213 | 4804 (+117%) |

A mapped type per modifier call is far too expensive for the builder road.

### ColumnFormat, modifiers accumulated by intersection

Drop `Merge`: every prop optional, absent meaning false, `.notNull()` returns
`ColFormat<P & {notNull: true}>`, and the models probe with a single `extends` and no
`infer`. This is the best version of the idea.

| Columns | today | merge-free bag |      |
| ------: | ----: | -------------: | ---- |
|       5 |   903 |            552 | -39% |
|      10 |  1093 |            818 | -25% |
|      20 |  1463 |           1372 | -6%  |
|      40 |  2213 |           2458 | +11% |

It wins on narrow tables and loses on wide ones, crossing over around twenty columns. And
this is a **stripped prototype measured against the real implementation**: it has no
runtype formats, no key flags, no `$type`, no arrays, no reflection sentinels. Every
feature added moves the crossover down. The apparent win is the prototype's simplicity,
not the design's.

That is the trap in this whole area, and it is worth stating plainly: a small prototype of
a new column design will always look good next to the real one. The bag-flattening figures
above are the honest measurement, because both sides are real code.

## What this does not measure

- `refineTableType`, still the single most expensive step in the pipeline at 1141.
- The runtime half. Moving `toDrizzle` onto metadata-driven generation, the way MockData
  reads a `TypeFormat`, is a runtime architecture question and independent of everything
  above. Half of it already exists: `buildRtTableFromGraph` reconstructs a slim table from
  the reflected `@rtTableKey` meta. Two things to settle before the builder road joins it:
  a bag has no call ORDER, where the recorder replays modifiers in the order they were
  written, and runtime-only values (interpolated `sql`, `$defaultFn`, cross-table
  references) can live in a runtime bag but never in a type, which is why the type road
  already routes them through `options.runtime`.

## Reproducing

Add a case to
[`packages/type-budget/test/typeRoad.compile.test.ts`](../type-budget/test/typeRoad.compile.test.ts),
which already builds the measurer with `makeMeasurer` from
[`packages/ts-runtypes/test/types/compileHarness.ts`](../ts-runtypes/test/types/compileHarness.ts)
and a snippet path inside `packages/type-budget` so the workspace packages resolve. When
prototyping a design, put its machinery in its own PREAMBLE, so the baseline subtraction
removes the machinery and what is left is what a user's table costs.

Three traps, all of which have caught someone here:

- **Consume the model.** Read fields into annotated consts. A bare
  `type Row = InferSelectModel<...>` measures almost nothing, because the checker stays
  lazy and the case looks free.
- **Check the errors.** A snippet with type errors reports a number, and it is meaningless:
  the checker stops early. The first run of the column-metadata spike had a broken
  prototype and reported a 57% win that vanished once it compiled.
- **Isolate before attributing.** Measure the case with the feature REMOVED, not just the
  case with it present. The 966 at the top of this file was a real number attached to the
  wrong cause, and one measurement of a modifier-free table would have caught it.
- **Measure what a change ENABLES, not only the change as written.** A spec describes one
  edit; the win is often a second edit the first one unlocks. Modifiers as props measured
  at exactly zero while `NormalizeCol` was kept, and at -17 to -25% once it was deleted,
  which only props make possible. The first number was reported as a rejection and it was
  wrong. Before writing "no win", ask what is now expressible that was not before.
