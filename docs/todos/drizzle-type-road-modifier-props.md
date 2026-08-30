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

Verified starting points; the implementer plans the details.

Today every modifier is its own interface holding one optional symbol-keyed member
(`NotNull` at packages/drizzle-orm/src/typeColumns.ts:90), so an authored column is an
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

What that removes is `ColModsOf` (packages/drizzle-orm/src/typeColumns.ts:201), which
re-materializes the merged intersection into a fresh object per column before any flag can
be read. What it does NOT remove is the seven-odd `HasAnyKey` probes per column that derive
`notNull` / `hasDefault` / `insertExcluded` from those mods, nor `NormalizeCol` itself
(typeColumns.ts:282). **So the share of the 966 this collects is unknown, and measuring it
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
- **Two readers depend on the current sentinels.** The runtime bridge reads them in
  `readColumnSpec` / `applyMods` (packages/drizzle-orm/src/fromType.ts:133 and :168), and
  the Go convert program reads `@rtColModsKey` by name
  (ts-go-runtypes/internal/convert/drizzle.go:45). Both move in the same change or the
  type road and `drizzle-migrate` break.
- **Whether this is breaking.** The dialect packages are at 0.45.0 and ride the drizzle
  version line. Check whether they are actually published before deciding between a clean
  swap and keeping the marker spelling working alongside the props one. The predecessor
  spec ([docs/done/drizzle-type-road-ergonomics.md](../done/drizzle-type-road-ergonomics.md))
  reworked this surface freely on the grounds that nothing was published yet; confirm that
  still holds.
- **Not in scope.** The `[rtTableKey]` meta shape, flattening columns into params bags, and
  the ColumnFormat redesign. All measured, all rejected, all recorded in TYPE-COST.md.
  Moving `toDrizzle` onto metadata-driven generation is a separate runtime question and
  does not belong here.

## Done when

- A measured before/after on the real packages, in the same harness TYPE-COST.md uses, that
  isolates this change alone. TYPE-COST.md updated with the number, whichever way it goes.
- The type road's cost for a five-column table with a select model is materially closer to
  321 than to 1287, or the todo is closed with the measurement showing why it cannot be.
- The builder road's cost has not gone up, at 5, 20 and 40 columns.
- `pnpm test` green, the type-budget budgets lowered rather than raised, the reflection
  bridge and the Go convert program moved with the sentinels, and the drizzle-e2e lane
  still passes on all three dialects.
- Website docs and `packages/examples/` updated to the new spelling wherever the type road
  is shown.
