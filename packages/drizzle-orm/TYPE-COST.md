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

### Shape B, props that let the alias BE the branded column: -17 to -25%

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

| Case                       | Today | Direct alias | Change |
| -------------------------- | ----: | -----------: | -----: |
| 20 plain columns           |  2116 |         1589 |   -25% |
| 5 mixed columns            |  1258 |         1048 |   -17% |
| wide vocabulary, 7 columns |  1956 |         1633 |   -17% |

The wide case is the one to trust: serial with intrinsic base flags, enum text, identity,
array, `$type`, unique, defaultNow. The prototype was pinned against the builder road with
`Equal<>` on the select AND the insert model, and all three roads agreed, so this is not a
cheaper-but-lossy prototype.

An empty-modifier fast path (`[keyof Mods] extends [never]`) takes 20 plain columns to
1229, but costs about 10 a column on columns that do have modifiers.

Not taken in that pass because it breaks the public spelling of every column across three
dialect packages, the Go convert translator, the runtime bridge, the manifests, the docs and
the examples. Specced in
[`docs/todos/drizzle-normalize-col-carrier-cost.md`](../../docs/todos/drizzle-normalize-col-carrier-cost.md).

### And most of what is left is not derivation at all

Before anyone chases the pre-branded floor: twenty type-road columns cost 2116 with
distinct db names and 767 when every column is nameless. The builder road's twenty columns
are twenty references to ONE type, because the db name is a runtime argument; the type
road's are twenty separate instantiations, because the name and config ride in the type.
That is the price of being reflectable and it is not removable while `tableFromType` and
`ts-runtypes convert` exist. The honest target is 767, not 436.

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

## Measured and NOT taken: reading the model flags off one payload

`InferSelectModel` and friends read each column's four brand flags through four separate
`C extends RtColumnBrand<infer ...>` probes. Reading the payload once instead
(`NonNullable<C[typeof rtColumnKey]>`, then indexed accesses) is a real win on wide tables
and on both roads: a twenty-column builder-road select model went 465 to 363, and the
model-pipeline chain's total dropped 13328 to 13271.

It is not in the tree, because the pipeline suite budgets each STEP, and the change moves
work between steps. Every shape of it (select only, insert and update only, all three)
leaves the cumulative total lower but pushes at least two per-step deltas over their
budgets, and those budgets are one-way downward. Taking this needs the pipeline suite to
grow a total-cost budget alongside the per-step ones, which is a change to the measurement
contract and belongs in its own pass. The remaining per-column cost is specced in
[`docs/todos/drizzle-normalize-col-carrier-cost.md`](../../docs/todos/drizzle-normalize-col-carrier-cost.md).

## Rejected: moving the column metadata into a flat "params bag"

The idea: a column type stops carrying its metadata in generic positions
(`RtPgColumn<Data, NotNull, HasDefault, InsertExcluded>`) and carries it as props on one
object instead, the way a runtypes `TypeFormat` does. Four shapes were measured. All four
lost.

### It is not the `[rtTableKey]` duplication

Hovering a slim table shows its columns once in the intersection and again inside the
meta, which reads like wasted work. It is not: TypeScript instantiates the columns once
and both positions reference the same type.

| Meta shape                                         | Net |
| -------------------------------------------------- | --: |
| `Cols & {[key]: Meta<Name, Cols, Extras>}` (today) | 219 |
| `Cols & {[key]: Meta<Name, Extras>}` (no columns)  | 219 |

Writing the mapped type out twice by hand, with no shared alias, costs **+1**. And
dropping `columns` from the meta makes things worse, because `ColsOf` stops being an
indexed access:

```ts
type ColsOf<T> = T[typeof rtTableKey]['columns']; // 224
type ColsOf<T> = Omit<T, typeof rtTableKey>; // 264
```

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

- `refineTableType`, the single most expensive step in the pipeline at 1198.
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
