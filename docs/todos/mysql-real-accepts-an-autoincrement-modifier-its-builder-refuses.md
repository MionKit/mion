---
type: fix
spec: guidelines
status: ready
created: 2026-09-21
---

# The mysql Real column type accepts an autoincrement modifier its builder refuses

## Intent

In [packages/drizzle-orm-mysql-core/src/columns.ts](../../packages/drizzle-orm-mysql-core/src/columns.ts)
the `Real` column TYPE takes the integer modifier bag:

```ts
export type Real<
  A extends string | (MySqlRealConfig & MySqlIntColMods) | undefined = undefined,
  C extends MySqlRealConfig & MySqlIntColMods = Record<never, never>,
> = RtColType<'real', ColNameArg<A>, ColConfigArg<A, C>, FloatFormat>;
```

`MySqlIntColMods` adds `autoincrement?: true`. But the builder returns a plain column:

```ts
export function real(config?: MySqlRealConfig): RtMyColumn<FloatFormat, false, false, false>;
```

`RtMyColumn` has no `autoincrement()` method; only `RtMyIntColumn` does. So
`Real<'r', {autoincrement: true}>` compiles on the type road while `real('r').autoincrement()` does
not compile on the builder road. `real` is a float, so autoincrement does not belong on it either
way.

This breaks a rule the same file states a few lines above the modifier bags:

> `Varchar<'v', {autoincrement: true}>` is an error rather than a silent no-op.

That is the whole point of having per-kind bags. `Real` is the one column that escapes it.

Note the pg package goes the OTHER way on purpose: `Bigserial` uses `PgColMods` while `bigserial()`
returns `RtPgIntColumn`. That direction is safe (the type is narrower than the builder). Do not
"fix" it by copying whatever `Real` ends up doing; check it separately if at all.

## What to settle

Almost certainly `Real` should take `MySqlColMods`, not `MySqlIntColMods`. Confirm against drizzle's
own mysql `real` (it has no auto_increment) and make the change.

Then sweep the rest of the three dialect packages for the same class of mismatch: for every column
TYPE, the modifier bag it accepts must match the modifiers the matching builder's return interface
actually offers.

## Evidence to produce

- A `type-pins.stub.ts` entry pinning `Real<'r', {autoincrement: true}>` as a `@ts-expect-error`,
  the same way the packages pin their other intentional rejections.
- The completeness and manifest-coverage specs still green in all three dialect packages.
- The sweep's result, even if `Real` is the only one: say so, so the next reader does not redo it.

## Watch out

- Changing the accepted config changes what the type road records, so check the id-convergence
  tests: a table declared through the builder and the same table declared as a type must still
  produce one structural id.
- `drizzle-e2e` is the lane that proves a `toDrizzle()` table works against a real database. Label
  the PR `drizzle-e2e` so it runs.

## Origin

Found during a repo-wide comment simplification pass, by reading the modifier-bag comment against
the `Real` declaration below it.
