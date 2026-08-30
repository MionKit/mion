# Type-instantiation cost of the slim column and table types

Every consumer's editor pays these numbers on every keystroke, so this file records what
has been measured, to keep the next person from re-deriving it. The measurements come
from the harness in [`packages/type-budget`](../type-budget/), the same one behind
[`reports/model-pipeline.md`](../type-budget/reports/model-pipeline.md); each figure
below is **net instantiations**, the snippet's own cost with the import baseline
subtracted.

## The headline: the type road pays 4x the builder road for the same model

The same five-column table, the same `InferSelectModel`, three ways of writing it:

| How the table is written                                | Net instantiations |
| ------------------------------------------------------- | -----------------: |
| builder road, `pgTable('users', {...})`                 |                501 |
| type road, `PgTable<'users', {Varchar<...> & NotNull}>` |               1287 |
| type road, columns already branded (`PgBuilderTable`)   |                321 |

The third row skips `TypedCols` / `NormalizeCol` entirely by naming the branded column
types directly. It is not a design anyone would author by hand, but as a measurement it
isolates the normalization exactly:

**966 of the type road's 1287, three quarters of it, is turning
`Varchar<'name', {length: 100}> & NotNull` into a branded column.** Everything else about
the type road is already cheaper than the builder road, because no value-level inference
happens.

That is where the money is. Anything that lets the type road spell its modifiers without
an intersection the checker has to unpick would collect most of that 966.

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

Build measurers with `makeMeasurer` from
[`packages/ts-runtypes/test/types/compileHarness.ts`](../ts-runtypes/test/types/compileHarness.ts),
passing `RESOLVING_OPTIONS` and a snippet path inside `packages/type-budget` so the
workspace packages resolve. Put each design's machinery in its own PREAMBLE, so the
baseline subtraction removes the machinery and what is left is what a user's table costs.

Two traps:

- **Consume the model.** Read fields into annotated consts. A bare
  `type Row = InferSelectModel<...>` measures almost nothing, because the checker stays
  lazy and the case looks free.
- **Check the errors.** A snippet with type errors reports a number, and it is meaningless:
  the checker stops early. The first run of this spike had a broken prototype and reported
  a 57% win that vanished once it compiled.
