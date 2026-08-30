---
type: chore
spec: guidelines
status: ready
created: 2026-08-30
---

# Drizzle type road: modifiers as props, not intersected markers

## Intent

Authoring a slim table as a TYPE costs four times what the builders cost for the
identical model, and three quarters of that is one thing: unpicking the modifier marker
intersections. Measured on the real packages, same five columns, same
`InferSelectModel`:

| How the table is written                                | Net instantiations |
| ------------------------------------------------------- | -----------------: |
| builder road, `pgTable('users', {...})`                   |                501 |
| type road, `Varchar<'name', {length: 100}> & NotNull`     |               1287 |
| type road, columns already branded (no normalization)     |                321 |

The third row names the branded column types directly, which skips `TypedCols` /
`NormalizeCol` entirely. Nobody would author that by hand, but as a measurement it puts a
number on the normalization: **966 of the type road's 1287**. The already-branded form is
cheaper than the builder road, because no value-level inference happens, so the ceiling
here is real.

Consumers pay this in their editor on every keystroke, and the type road is the road we
point people at for schema-first work.

The full background, including the four column redesigns that were measured and rejected,
is in [`packages/drizzle-orm/TYPE-COST.md`](../../packages/drizzle-orm/TYPE-COST.md).
Read it before starting: it also records the trap that a small prototype of a new column
design always looks good next to the real implementation.

## Direction

**This is a guidelines spec, not a plan. Nothing below is a decided design.**
Re-investigate from the current tree before writing any code. Every `file:line` here was
correct on 2026-08-30 and will have moved. The numbers in the Intent were measured against
TypeScript 6.0.3 and drizzle-orm 0.45.2 and must be re-taken on the tree you are working
from, because the whole point of the change is to move them and you need your own baseline.
Treat each bullet below as a question to answer, not an instruction to follow.

Today every modifier is its own interface holding one optional symbol-keyed member
(`NotNull` at packages/drizzle-orm/src/typeColumns.ts:100), so an authored column is an
intersection the checker must merge before anything can read it:

```ts
name: Varchar<'name', {length: 100}> & NotNull;
createdAt: Timestamp<'created_at', {mode: 'date'}> & NotNull & DefaultNow;
```

The direction is to let the modifiers arrive as one literal object instead, so there is
no intersection to unpick:

```ts
name: Varchar<'name', {length: 100; notNull: true}>;
createdAt: Timestamp<'created_at', {mode: 'date'; notNull: true; defaultNow: true}>;
```

What that removes is `ColModsOf` (packages/drizzle-orm/src/typeColumns.ts:211), which
re-materializes the merged intersection into a fresh object per column before any flag can
be read. What it does NOT remove is the 9 `HasAnyKey` call sites (typeColumns.ts:218-271)
that derive `notNull` / `hasDefault` / `insertExcluded` and the key flags from those mods,
nor `NormalizeCol` itself
(typeColumns.ts:296). **So the share of the 966 this collects is unknown, and measuring it
is the first task, not the last.** If the isolated change does not move the number
materially, say so and stop rather than shipping churn.

Things to weigh, none of them settled:

- **Config or third argument.** Folding the modifiers into the existing config object
  (`Varchar<'name', {length: 100; notNull: true}>`) keeps the arity, but mixes drizzle's
  own builder config with our flags in one bag, which the reflection walker and the convert
  program both have to keep telling apart. A separate third argument keeps them apart at
  the cost of one more type parameter. Measure both.
- **The builder road must not regress.** It is the default road and it is the one that
  scales with table width. Any change here is a loss if `pgTable(...)` gets more expensive.
- **Three readers depend on the current sentinels.** The runtime bridge reads them in
  `readColumnSpec` / `applyMods` (packages/drizzle-orm/src/fromType.ts:144 and :187); the
  Go convert program reads `@rtColModsKey` by name
  (ts-go-runtypes/internal/convert/drizzle.go:46); and the manifests record modifier names
  per builder (packages/drizzle-orm-pg-core/manifests/pg.manifest.json and its mysql and
  sqlite siblings). All three move in the same change, or the type road,
  `drizzle-migrate`, and `pnpm rtx core drizzle-manifest --check` break. The
  `drizzle-slim-schemas` skill owns the manifest half.
- **Nothing is published, so swap cleanly.** `npm view @mionjs/drizzle-orm-pg-core` returns
  404 as of 2026-08-30. The `versionLine` marker means these packages ride drizzle's
  version line rather than the lockstep train, but there is nothing on the registry to stay
  compatible with, so no shim and no deprecation path. Same ground the predecessor spec
  ([docs/done/drizzle-type-road-ergonomics.md](../done/drizzle-type-road-ergonomics.md))
  stood on. Re-check before starting, in case a release happened in between.
- **Decide what happens to the 19 marker interfaces** (`NotNull`, `PrimaryKey`,
  `DefaultNow` and the rest, typeColumns.ts:89-210). Deleted outright, or kept as a thin
  alias over the props form so existing type-road tables keep compiling? If they are kept,
  measure whether they cost anything when unused.
- **Not in scope.** The `[rtTableKey]` meta shape, flattening columns into params bags, and
  the ColumnFormat redesign. All measured, all rejected, all recorded in TYPE-COST.md.
  Moving `toDrizzle` onto metadata-driven generation is a separate runtime question and
  does not belong here.

## Done when

- A measured before/after on the real packages, in the harness TYPE-COST.md describes, that
  isolates this change alone. TYPE-COST.md updated with the number, whichever way it goes,
  a null result included.
- The type road's five-column select-model cost has moved materially toward 321, or the
  todo is closed with the measurement showing why it cannot be.
- The builder road has not regressed. Check both a narrow and a wide table, since that road
  is the one whose cost scales with column count.
- The PR-readiness gate in CLAUDE.md: tests, website docs and `packages/examples/` updated
  wherever the type road is spelled out, type-budget budgets lowered rather than raised,
  the three sentinel readers moved together, and the drizzle-e2e lane green on all three
  dialects.
