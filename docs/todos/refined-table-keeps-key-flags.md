---
type: fix
spec: guidelines
status: ready
created: 2026-09-25
---

# Refined tables keep their column key flags

## Intent

`refineTableType` drops a column's key flags, so a refined MySQL table loses its keys from `$returningId()`. Repro (mysql package, `tsc`):

```ts
const users = mysqlTable('users', {id: serial('id').primaryKey(), name: varchar('name', {length: 50}).notNull()});
const refined = refineTableType(users, {id: {max: 1000}});
const a = await db.insert(toDrizzle(users)).values({name: 'a'}).$returningId();   // {id: number}[]
const b = await db.insert(toDrizzle(refined)).values({name: 'a'}).$returningId(); // {}[]
b[0].id; // TS2339: Property 'id' does not exist on type '{}'.
```

## Direction

- Cause: `RefinedBrand` in `packages/drizzle-orm/src/refine.ts:30-39` rebuilds a bare `RtColumnBrand<MergeFormat<Data, Params>, ...>` for every refined column, so the column's `rtColumnKeyFlagsKey` member (`recorder.ts:69-74`, read by `ColKeyFlagsOf` in each dialect's `drizzle.ts` `ToDrizzleTable`) is gone and falls back to `NoKeyFlags`.
- Fix: keep the key flags (and any other column metadata the refine does not change) on the refined column. Watch the type cost: `refineTableType` has its own budget in `packages/private-type-budget` (model pipeline step 2); budgets only go down, an increase is a reviewed exception.
- Check pg too: `identity` on `SynthConfig` also comes from the key flags (pg `drizzle.ts`), so a refined pg identity column may lose `overridingSystemValue()` behaviour the same way.
- The implementer plans the details.

## Docs

None, because this restores behaviour the docs already promise (a refined table works with `toDrizzle` like the original).

## Done when

- A type test pins `$returningId()` on a refined MySQL serial table (and the pg identity case if affected), failing before the fix.
- Type budgets hold (or a reviewed exception is recorded).
- The simplify-comments pass ran on every touched source file, committed on its own.
