---
type: chore
spec: guidelines
status: ready
created: 2026-08-30
---

# What the type road still pays per column, and the model read that was blocked

## Intent

The type road (a slim drizzle table written as `PgTable<'users', {...}>` instead of builder
calls) got about 20% cheaper in the modifier-props pass. What is left is bigger than what
was collected, and one measured win could not land because of how the budget suite is
shaped. Both are recorded here so neither gets lost.

Read [`packages/drizzle-orm/TYPE-COST.md`](../../packages/drizzle-orm/TYPE-COST.md) first.
It carries the full history, including four designs that were measured and rejected, and
the three traps that have each caught someone in this area.

The numbers below come from
[`packages/type-budget/test/typeRoad.compile.test.ts`](../../packages/type-budget/test/typeRoad.compile.test.ts),
which re-measures them on every run and writes
[`reports/type-road.md`](../../packages/type-budget/reports/type-road.md). Take your own
baseline there before starting; these were TypeScript 6.0.3 and drizzle-orm 0.45.2.

## What is left

Twenty plain integer columns, `InferSelectModel` consumed:

| Case                          | Net instantiations |
| ----------------------------- | -----------------: |
| type road                     |               2116 |
| builder road                  |                465 |
| pre-branded (no normalization) |                436 |

So normalization still costs about 1680 over twenty columns, roughly 84 a column. Measured
with every flag derivation stripped out (a deliberately WRONG build, just to price the
parts), about 27 of that is the flag derivations and about 60 is the carrier itself: the
`RtColType` spec object per column, `TypedCols`, `NormalizeCol`, and building the
`RtTypedColumn` that the models then take apart again.

That last shape is the thing to look at hardest. The type road builds a branded column so
that `ColDataOf` / `ColNotNullOf` / `ColHasDefaultOf` / `ColInsertExcludedOf` can infer the
same four values straight back out of it. It is build-then-destructure, once per column,
and it exists so both roads can share one model derivation.

### The two roads do NOT land on the same column type

Worth knowing before starting, because it is easy to assume otherwise. The row models are
identical (the suite pins `Equal<builderRow, typeRow>`), but the tables are not. Asked of
the checker, one `varchar('name', {length: 100}).notNull()` column resolves to:

```ts
// builder road
RtPgColumn<String<{maxLength: 100}>, true, false, false>

// type road
RtTypedColumn<String<{maxLength: 100}>, true, false, false,
  {fn: 'varchar'; name: 'name'; config: {length: 100}; data: String<{maxLength: 100}>; base: never},
  {notNull: true},
  never>
```

The first four arguments are the whole brand the models read, which is why the rows match.
After that they diverge: `RtPgColumn` carries the chain methods so a builder call can keep
going, and `RtTypedColumn` carries none of them but carries the spec and mods sentinels, so
`tableFromType` and the Go convert program can rebuild the builder calls from the type
alone. That extra baggage is most of the 60.

So the open question is whether the two roads can land on ONE column type. The sentinels
have to survive, because reflection reads them; the chain methods have to survive, because
the builders return them. Whether one type can carry both without either road paying for
the other's half is unmeasured.

## Direction

**This is a guidelines spec, not a plan.** Nothing below is decided. Re-investigate from
the current tree, and treat each bullet as a question.

- **The blocked model read, first.** Reading a column's four brand flags off ONE payload
  (`NonNullable<C[typeof rtColumnKey]>`, then indexed accesses) instead of four separate
  `C extends RtColumnBrand<infer ...>` probes is already measured: a twenty-column
  builder-road select model went 465 to 363, and the model-pipeline chain's total dropped
  13328 to 13271. It helps BOTH roads, which nothing else here does.
  It is not in the tree because `modelPipeline.compile.test.ts` budgets each STEP, and the
  change moves work between steps: every shape of it leaves the cumulative total lower but
  pushes at least two per-step deltas over budgets that are one-way downward. Decide
  whether the pipeline suite should carry a total-cost budget beside its per-step ones. If
  it should, that is the first change, and this win lands behind it.
- **Can the models read an authored column without normalizing it first?** That would
  remove the build-then-destructure entirely, at the cost of a road probe per read. It may
  well be worse; measure it rather than assuming either way.
- **Does `TypedCols` need to run at all for a model?** Its record-level fast path already
  passes an already-branded record straight through. Whether the type road can get a
  similarly cheap path, and what it would cost the reflection sentinels, is open.
- **`refineTableType` is the single most expensive step in the whole pipeline at 1198**,
  larger than everything this spec is about. It is out of scope here only because it is a
  different mechanism, not because it is cheap. If you find yourself with a clean way in,
  it is worth more than the rest of this.
- **Not in scope.** The `[rtTableKey]` meta shape, flattening columns into params bags, the
  ColumnFormat redesign, and modifiers as props. All measured, all rejected, all recorded
  in TYPE-COST.md. Re-proposing one of them needs a measurement that contradicts what is
  written there, not an argument.

## Done when

- A measured before/after in the type-road suite, with the budgets lowered to the new
  numbers, or the todo closed with the measurement showing why they cannot move.
- The builder road has not regressed on a narrow OR a wide table. It is the default road
  and the one whose cost scales with column count.
- The pipeline suite's budget contract is either unchanged or deliberately changed, with
  the reasoning written into the suite.
- TYPE-COST.md updated with whatever was learned, a null result included.
- The PR-readiness gate in CLAUDE.md, and the drizzle-e2e lane green on all three dialects
  if any authoring surface moved (the PR carries the `drizzle-e2e` label).
