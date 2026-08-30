---
type: chore
spec: guidelines
status: done
created: 2026-08-30
completed: 2026-08-30
---

# Type road: the column alias produces the branded column directly

## What shipped

A slim drizzle table written as a type (`PgTable<'users', {...}>`) used to cost about twice
what the same table costs written with the builder calls. Roughly half of that gap was one
step: an authored column was a spec CARRIER that `NormalizeCol` converted into a branded
column afterwards, once per column, re-deriving from literals what the builder overload
hands over for free.

A column type now expands STRAIGHT to the branded column the builders return, so the whole
normalization pass is gone and `TypedCols` hands an authored record through wholesale. That
required modifiers to arrive as props, because an intersection can add facts but cannot flip
a type parameter on the column it intersects with.

A second, independent change landed with it: the flat models, `RefineCols` and the
`toDrizzle` config synthesis now read a column's brand payload ONCE per column instead of
probing it once per flag. That one helps the builder road too.

Live numbers are in
[`packages/type-budget/reports/type-road.md`](../../packages/type-budget/reports/type-road.md)
and re-measured on every run. Measured on the real packages, TypeScript 6.0.3 and drizzle-orm
0.45.2:

| Case                              | Before | Props | + payload read | Total |
| --------------------------------- | -----: | ----: | -------------: | ----: |
| type road, 20 plain columns       |   2116 |  1595 |           1340 |  -37% |
| type road, 5 mixed columns        |   1258 |  1045 |            967 |  -23% |
| type road, 5 mixed + insert model |   1895 |  1673 |           1434 |  -24% |
| type road, wide vocabulary        |   1560 |  1246 |           1169 |  -25% |
| builder road, 20 plain columns    |    465 |   465 |            343 |  -26% |
| builder road, 5 mixed columns     |    646 |   646 |            568 |  -12% |
| pre-branded floor, 20 columns     |    436 |   436 |            314 |  -28% |
| model pipeline, whole chain       |  13328 | 13328 |          13077 |   -2% |

## The authored spelling that changed

A column type takes the db column name, then ONE object holding the builder's own config
keys and its modifier calls. A call with no arguments spells `true`, a call with arguments
spells the args tuple (never the bare value: `default(true)` has to stay distinguishable
from a flag when the bridge replays it).

```ts
// before                                     // after
Uuid<'id'> & PrimaryKey                       Uuid<'id', {primaryKey: true}>
Varchar<'name', {length: 100}> & NotNull      Varchar<'name', {length: 100; notNull: true}>
Integer<'age'> & Default<21>                  Integer<'age', {default: [21]}>
Text<'tags'> & Array & NotNull                Text<'tags', {array: true; notNull: true}>
Text<'email'> & Unique<'uq'>                  Text<'email', {unique: ['uq']}>
Uuid<'org'> & References<'orgs', 'id'>        Uuid<'org', {references: [{table: 'orgs'; column: 'id'}]}>
Jsonb<'p'> & $Type<{kind: string}>            Jsonb<'p', {$type: [{kind: string}]}>
Integer & NotNull                             Integer<{notNull: true}>
```

Nothing was published (`npm view @mionjs/drizzle-orm-pg-core` still 404s), so there is no
shim and no deprecation path. The 19 marker interfaces are deleted.

## The one-object trade, and the gates under it

Config and modifiers share one object, so nothing in the type says which half a key belongs
to. Both readers split it by a list of the 18 modifier names: the runtime bridge
(`readColumnSpec` / `applyMods` in `packages/drizzle-orm/src/fromType.ts`) and the Go convert
program (`printDrizzleType` / `specFromGraph` in
`ts-go-runtypes/internal/convert/drizzle.go`). Both skip the wrong-half keys BEFORE reading a
value, because `$type` carries a type with no literal value at all.

Three gates keep that sound, each reading the generated manifests rather than the other list:

- `packages/drizzle-orm/src/colMods.spec.ts` — `colModNames` equals the union of `modifiers`
  across the three manifests, and no column config key in any dialect is named like a
  modifier.
- `TestDrizzleModNamesMatchManifests` in `ts-go-runtypes/internal/convert` — the same check
  for the Go list.
- each dialect's `manifest-coverage.spec.ts` — every modifier drizzle records has a key in
  some `*ColMods` bag, so it is spellable at all. (This replaced the gate that required a
  marker type per modifier.)

`customType` has no type-road spelling, so a user-defined config cannot collide today.

## Also shipped: per-builder modifier bags

Each column type is now constrained to its own builder's modifiers, which the marker
interfaces could not do: `Varchar<'v', {autoincrement: true}>` is an error on pg. The bags
fall out of the manifests onto the kind interfaces that already group the builders by
drizzle's method sets: pg four (common / +defaultNow / +defaultRandom / +identity), mysql
three, sqlite one. Pinned per dialect with `@ts-expect-error` in `type-pins.stub.ts`.

## The measurement contract changed

`packages/type-budget/test/modelPipeline.compile.test.ts` grew a TOTAL budget
(`PIPELINE_TOTAL_BUDGET`) beside its per-step ones. Per-step deltas cannot see work moving
BETWEEN layers, which is exactly what the payload read does: every shape of it left the chain
total lower while pushing per-step deltas around. Step 6 rises by 2 (drizzle's own generics
consuming the synthesized column config); it is the only reviewed increase, recorded where
the budget lives.

## Two variants measured and rejected

- **An empty-modifier fast path** (`[keyof Mods] extends [never]`) saves ~18 per column with
  no modifiers and costs ~16 per column that has some. 20 plain columns 1443 to 1083, but 5
  mixed 1022 to 1112 and the wide case 1200 to 1310; a half-modified 20-column table barely
  moves (1772 to 1742). Real schemas put `notNull` on most columns, so it loses.
- **Splitting the props inside the type** (each alias picking its own config keys out, so
  neither reader would need the name list) costs 48 to 57 per configurable column: 5 mixed
  1022 to 1192, wide 1200 to 1394. The name list in two readers is the cheaper price.

Both are recorded in [`packages/drizzle-orm/TYPE-COST.md`](../../packages/drizzle-orm/TYPE-COST.md)
with the numbers.

## What was NOT done

`refineTableType` is still the most expensive step in the pipeline (1141, down from 1198). It
is a different mechanism and was out of scope.

The remaining type-road premium over the builder road is not a conversion pass any more. It
is that a type-road column carries its db name and config in the type, so twenty columns are
twenty distinct types where the builder road's twenty are twenty references to one. That is
the price of being reflectable and it cannot be removed while `tableFromType` and
`ts-runtypes convert` exist.

## Verified

`pnpm test`, `go -C ts-go-runtypes test ./internal/...`, `pnpm rtx core drizzle-manifest
--check`, `pnpm rtx core drizzle-translate --to-types` (drizzle's own suites: 191 tables
converted onto the type road, same type-error count before and after), `pnpm rtx core fuzz
drizzletypes` (both roads land on ONE runtype id per generated table), lint and format. The
drizzle-e2e lane runs the translated suites against real postgres, mysql and sqlite on the
pull request, which carries the `drizzle-e2e` label.
