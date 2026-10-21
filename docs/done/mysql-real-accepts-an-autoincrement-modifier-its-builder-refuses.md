---
type: fix
spec: guidelines
status: done
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

`MySqlIntColMods` adds `autoincrement?: true`. But the builder returned a plain column:

```ts
export function real(config?: MySqlRealConfig): RtMyColumn<FloatFormat, false, false, false>;
```

`RtMyColumn` has no `autoincrement()` method; only `RtMyIntColumn` does. So
`Real<'r', {autoincrement: true}>` compiled on the type road while `real('r').autoincrement()` did
not compile on the builder road.

This breaks a rule the same file states a few lines above the modifier bags:

> `Varchar<'v', {autoincrement: true}>` is an error rather than a silent no-op.

## What shipped, and how it differs from the plan above

The spec guessed the fix was to narrow `Real` to `MySqlColMods`, and asked for that to be confirmed
against drizzle first. **The check came back the other way, so the fix is the opposite one.**

Drizzle's own mysql `real` builder extends `MySqlColumnBuilderWithAutoIncrement`:

```
node_modules/drizzle-orm/mysql-core/columns/real.d.ts
export declare class MySqlRealBuilder<...> extends MySqlColumnBuilderWithAutoIncrement<T, MySqlRealConfig>
```

So does `float`, `double` and `decimal`. `manifests/mysql.manifest.json` agrees, listing
`autoincrement` for all four. MySQL allows `AUTO_INCREMENT` on any numeric column, not only the
integers. So the TYPE bag was right all along and the BUILDER was the side that had drifted.

Two other things follow from that, and both shipped here:

**The mismatch was never only `Real`.** The same drift hit four mysql columns, not one: `real`,
`float`, `double` and `decimal` all took `MySqlIntColMods` while returning `RtMyColumn`. All four
builders now return `RtMyIntColumn`.

**The pg serials were the same bug pointing the other way.** `serial`, `bigserial` and
`smallserial` returned `RtPgIntColumn`, which offers `generatedAlwaysAsIdentity()` and
`generatedByDefaultAsIdentity()`. Drizzle builds all three on plain `PgColumnBuilder`, with no
identity modifiers, and the pg manifest lists none. That direction is worse than a type-road-only
error: it compiles a call that drizzle's real builder has no method for. All three now return
`RtPgColumn`. The spec called this direction safe and said to check it separately; checked, it was
not safe.

pg's SynthConfig reads only `Key['identity']` off a column's key brand, and hardcodes
`isPrimaryKey` / `isAutoincrement` / `hasRuntimeDefault` to `false`. The serials carried
`NoKeyFlags`, which is also what `ColKeyFlagsOf` falls back to for a column with no brand, so
dropping the brand changes no model. mysql's SynthConfig does read `Key['autoincrement']`, and the
four numeric builders now set it exactly where the type road already did.

## The sweep, and the gate that replaces it

Sweeping all three dialect packages for the same class of mismatch found the four mysql columns and
the three pg serials, and **sqlite clean**. sqlite has two kind interfaces but one bag on purpose:
`RtSqliteColumn` and `RtSqliteIntColumn` differ only in what `primaryKey()` does to the hasDefault
flag, not in which modifiers exist, so one bag covers both.

The sweep is not the deliverable, because a sweep rots. Both existing gates check only a UNION and
so are blind to this whole bug class:

- each dialect's `manifest-coverage.spec.ts` checks that every manifest modifier appears in SOME
  `*ColMods` bag,
- pg's `completeness.spec.ts` checks that every drizzle method appears in SOME slim interface.

Neither can see a single column whose bag and builder disagree with each other. The gate added here
is the per-column complement: for every migrated column in every dialect, the manifest's modifier
list, the keys its column type's bag accepts, and the methods its builder's return interface offers
must be the same set. A column the parser cannot resolve FAILS rather than passing quietly, which
is what makes the gate trustworthy.

It lives in one place, `packages/drizzle-orm/src/manifest-coverage.spec.ts`, looping the rows of
`drizzle-dialects.json`, so a new dialect is covered the day its row lands. The parser is
`packages/drizzle-orm/test/modifierParity.ts`. Both fixes were re-introduced one at a time to
confirm the gate fails on each, with the offending column named in the message.

## Evidence produced

- The all-dialects parity gate above, green on mysql / pg / sqlite, and failing on either bug.
- mysql `type-pins.stub.ts`: `real`, `float`, `double` and `decimal` each take `.autoincrement()`,
  and `real('r').autoincrement()` converges with `Real<'r', {autoincrement: true}>` on the insert
  model, which is the id-convergence check this change needed.
- pg `type-pins.stub.ts`: `Serial<'id', {generatedAlwaysAsIdentity: true}>` and the builder spelling
  of the same thing are both pinned as `@ts-expect-error`.
- `pnpm run lint`, `pnpm run typecheck` and the JS suite green.

## Watch out

- `MySqlIntColMods` keeps its name though it now reads as "the numeric kinds". Renaming an exported
  type is a consumer-visible change and did not belong in this fix; its doc comment says what it
  actually covers.
- `drizzle-e2e` is the lane that proves a `toDrizzle()` table works against a real database, so the
  PR carries that label.

## Origin

Found during a repo-wide comment simplification pass, by reading the modifier-bag comment against
the `Real` declaration below it.
