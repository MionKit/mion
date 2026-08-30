---
type: chore
spec: guidelines
status: ready
created: 2026-08-30
---

# Type road: let the column alias produce the branded column directly

## Intent

The type road (a slim drizzle table written as `PgTable<'users', {...}>` instead of builder
calls) costs roughly twice what the builder road costs for the identical model. About half
of that gap is removable, and a prototype has already measured it. This spec is the follow
up to [`docs/done/drizzle-type-road-modifier-props.md`](../done/drizzle-type-road-modifier-props.md),
which cut 15 to 21% by a different route and left this on the table.

Read [`packages/drizzle-orm/TYPE-COST.md`](../../packages/drizzle-orm/TYPE-COST.md) first:
it carries the full history, four designs that were measured and rejected, and three traps
that have each caught someone here.

Live numbers come from
[`packages/type-budget/test/typeRoad.compile.test.ts`](../../packages/type-budget/test/typeRoad.compile.test.ts),
which re-measures on every run and writes
[`reports/type-road.md`](../../packages/type-budget/reports/type-road.md). Take your own
baseline there before starting; the figures below were TypeScript 6.0.3 and drizzle-orm
0.45.2.

## Why the two roads cost different amounts

Two facts, both measured, that a reader will otherwise assume away.

**They do not land on the same column type.** The row models are identical (the suite pins
`Equal<builderRow, typeRow>`, and the fuzz now pins that both roads resolve to one runtype
id over generated tables). The columns are not:

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
`RtPgColumn` then carries the chain methods so a builder call can keep going;
`RtTypedColumn` carries none of them and carries the reflection sentinels instead, so
`tableFromType` and the Go convert program can rebuild the builder calls from the type
alone.

**Most of the gap is not the derivation, it is that every type-road column is a DISTINCT
type.** Twenty columns, `InferSelectModel` consumed:

| Case                                        | Net instantiations |
| ------------------------------------------- | -----------------: |
| type road, 20 columns with distinct db names |               2116 |
| type road, 20 columns all nameless           |                767 |
| builder road, 20 columns                     |                465 |
| pre-branded, 20 columns                      |                436 |

The builder road's twenty columns are twenty references to ONE type, because the db name is
a runtime argument, not a type parameter. The type road's twenty are twenty separate
instantiations, because the name and config ride in the type. That is the price of being
reflectable, and it is not removable while `tableFromType` and `ts-runtypes convert` exist.
Anyone chasing the 436 floor is chasing something the type road cannot reach; the honest
target is the 767.

## Direction

**This is a guidelines spec, not a plan**, but unlike most it has a prototype behind it.
Re-measure before trusting any figure.

### The proven change: modifiers as props, and an alias that IS the branded column

Today a type-road column is a spec CARRIER that `NormalizeCol` converts into a branded
column afterwards, once per column, through `TypedCols`'s mapped pass. The conversion
re-derives from literals what the builder overload hands over for free.

It does not have to. Everything `NormalizeCol` extracts is already a type parameter inside
the column alias. If the alias expands straight to the branded column, `TypedCols` takes
its existing wholesale pass-through branch (`Cols extends Record<string, AnyRtColumn>`) and
the entire normalization pass disappears:

```ts
export type DirectCol<Fn extends string, Name extends string | undefined, Config, Data, Base extends string, Mods> =
  RtTypedColumn<
    WithArray<WithTypeOverride<Data, Mods>, Mods>,
    ModNotNull<Base, Mods>,
    ModHasDefault<Base, Mods>,
    ModInsertExcluded<Mods>,
    {fn: Fn; name: Name; config: Config; data: Data; base: Base},
    Mods,
    Base
  >;

export type Varchar<
  A extends string | (PgVarcharConfig & PgColMods) | undefined = undefined,
  C extends PgVarcharConfig & PgColMods = Record<never, never>,
> = DirectCol<'varchar', ColNameArg<A>, ColConfigArg<A, C>, VarcharData<ColConfigArg<A, C>>, never, ColConfigArg<A, C>>;
```

This REQUIRES modifiers as props, because an intersection can only add facts, it cannot
flip a type parameter on the column it intersects with. That is the change the predecessor
spec proposed and the measurement rejected, but it was rejected in the shape that KEPT
`NormalizeCol`. Deleting it is a different design and it wins:

| Case                             | Today | Direct alias | Change |
| -------------------------------- | ----: | -----------: | -----: |
| 20 plain columns                 |  2116 |         1589 |   -25% |
| 5 mixed columns                  |  1258 |         1048 |   -17% |
| wide vocabulary, 7 columns       |  1956 |         1633 |   -17% |

The wide case is the one to trust: serial with intrinsic base flags, enum text, identity,
array, `$type`, unique, defaultNow. The prototype was checked against the builder road with
`Equal<>` pins on the select AND the insert model, and all three roads agreed.

An empty-modifier fast path (`[keyof Mods] extends [never]`) takes 20 plain columns further,
to 1229, but costs about 10 a column on columns that do have modifiers. Measure it on a
realistic mix before deciding; do not assume either way.

### The authored spelling this changes

```ts
// today                                        // after
Uuid<'id'> & PrimaryKey                         Uuid<'id', {primaryKey: true}>
Varchar<'name', {length: 100}> & NotNull        Varchar<'name', {length: 100; notNull: true}>
Integer<'age'> & Default<21>                    Integer<'age', {default: [21]}>
Text<'tags'> & ColArray & NotNull               Text<'tags', {array: true; notNull: true}>
Text<'email'> & Unique<'uq'>                    Text<'email', {unique: ['uq']}>
Uuid<'org'> & References<'orgs', 'id'>          Uuid<'org', {references: [{table: 'orgs'; column: 'id'}]}>
Jsonb<'p'> & $Type<{kind: string}>              Jsonb<'p', {$type: [{kind: string}]}>
```

A no-arg call spells `true`, a call with arguments spells the args tuple (never the bare
value: `default(true)` must stay distinguishable from a flag when the bridge replays it).

Two things to weigh, neither settled:

- **Whether config and flags share one object** (as above) or get a separate slot. One
  object keeps the arity and needs no filler `{}` on a configurable column used without a
  config, at the cost of both readers splitting them by a known name list. No column config
  key in any of the three dialects clashes with a modifier name today (the `notNull` and
  `default` keys that exist are in `CustomTypeValues`, and `onUpdate` is in
  `ReferenceActions`, a nested modifier argument), so there is nothing to disambiguate
  except a user-defined `customType` config. Decide the rule for that and pin it.
- **The per-builder modifier bags are a correctness win too.** Today
  `Varchar<...> & Autoincrement` compiles even though pg varchar has no autoincrement. The
  manifests already record the modifier names per builder, so each alias can be constrained
  to its own set.

### What moves with it

Nothing is published (`npm view @mionjs/drizzle-orm-pg-core` returns 404), so there is no
shim and no deprecation path. Re-check before starting.

- The 19 marker interfaces in `packages/drizzle-orm/src/typeColumns.ts`, deleted.
- About 32 column aliases in each of the three dialect packages.
- `NormalizeCol` and `TypedCols`'s mapped branch, deleted from the type-road path.
- **The three sentinel readers move together or the road breaks**: the runtime bridge
  (`readColumnSpec` / `applyMods` in `packages/drizzle-orm/src/fromType.ts`), the Go convert
  printer and type-form reader (`ts-go-runtypes/internal/convert/drizzle.go`), and the
  manifests. The `drizzle-slim-schemas` skill owns the manifest half.
- The fuzz harness's `renderColumnType` / `renderTableType` in
  `packages/drizzle-orm-pg-core/test/tableSpecShared.ts` (its builders-form twin,
  `renderTableBuilders`, does not change).
- Seven files in `packages/examples/src/drizzle/`, and
  `container/website/sites/mion/content/03.drizzle-orm/00.drizzle-overview.md` and
  `07.migrate-an-existing-schema.md`. The overview's "modifiers join with `&`" paragraph
  becomes wrong.

## Also open: reading the model flags off one payload

`InferSelectModel` and friends read each column's four brand flags through four separate
`C extends RtColumnBrand<infer ...>` probes. Reading the payload once instead
(`NonNullable<C[typeof rtColumnKey]>`, then indexed accesses) helps BOTH roads, which
nothing else here does: a twenty-column builder-road select model went 465 to 363, and the
model-pipeline chain's total dropped 13328 to 13271.

It is not in the tree because `modelPipeline.compile.test.ts` budgets each STEP and the
change moves work between steps: every shape of it (select only, insert and update only,
all three) leaves the cumulative total lower but pushes at least two per-step deltas over
budgets that are one-way downward. Decide whether that suite should carry a total-cost
budget beside its per-step ones. If it should, that is a separate first change and this win
lands behind it.

## Out of scope

The `[rtTableKey]` meta shape, flattening columns into params bags, and the ColumnFormat
redesign. All measured, all rejected, all recorded in TYPE-COST.md. Re-proposing one needs
a measurement that contradicts what is written there, not an argument.

`refineTableType` is the single most expensive step in the whole pipeline at 1198, larger
than everything this spec is about. It is out of scope because it is a different mechanism,
not because it is cheap.

## Done when

- A measured before/after in the type-road suite, budgets lowered to the new numbers.
- The builder road has not regressed on a narrow OR a wide table.
- The three sentinel readers moved together, `pnpm rtx core drizzle-manifest --check` green,
  and `ts-runtypes convert --to type` round-tripping byte-identically both ways.
- The two-roads runtype id fuzz oracle in `drizzleTypeSource.integration.spec.ts` still
  green, and the hand-written twins in all three `typeTables.spec.ts` updated to the new
  spelling.
- TYPE-COST.md updated with whatever was learned, a null result included.
- The PR-readiness gate in CLAUDE.md, docs and `packages/examples/` updated, and the
  drizzle-e2e lane green on all three dialects (the PR carries the `drizzle-e2e` label).
