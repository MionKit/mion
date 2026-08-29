# `.format({...})` on the column chain, instead of `refineTableType`

Status: **SPIKE RESULT — the idea works and is measurably cheaper, but it does
not replace `refineTableType`.** Recommendation: ship BOTH, `.format()` as the
default for the common case, `refineTableType` kept for the cases `.format()`
structurally cannot express. Nothing is built yet beyond the pg prototype this
document measures.

## The idea

Today extra type-format constraints are added after the fact, to the whole table:

```ts
export const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull(),
  age: integer('age').notNull(),
});
export const apiUsers = refineTableType(users, {name: {minLength: 10}, age: {min: 18}});
```

The proposal is to put them on the column, where the rest of the column is
declared:

```ts
export const users = pgTable('users', {
  name: varchar('name', {length: 100}).notNull().format({minLength: 10}),
  age: integer('age').notNull().format({min: 18}),
});
```

## The prototype

Two edits, both tiny:

```ts
// packages/drizzle-orm/src/recorder.ts, on RtColumnRecorder
// Type-only, no drizzle counterpart: never recorded, or replay would call a
// method drizzle's builder does not have.
format(params: unknown) {
  void params;
  return this;
}
```

```ts
// packages/drizzle-orm-pg-core/src/columns.ts, on each of the four kind interfaces
format<const P extends RefinableParamsOf<Data>>(params: P): RtPgColumn<MergeFormat<Data, P>, N, H, X>;
```

That is the whole mechanism. It reuses the same `MergeFormat` /
`RefinableParamsOf` machinery `refineTableType` already uses, so there is no new
type-level concept to learn, maintain or document.

## Type cost, measured

Measured with `packages/type-budget/test/formatModifierSpike.compile.test.ts`
against the real packages (TypeScript 6.0.3, drizzle-orm 0.45.2). Every number
is net type instantiations attributable to the constraint, over the same table
declared without any constraint.

| Case | `refineTableType` | `.format()` | Saved |
| ---- | ----------------: | ----------: | ----: |
| 3 column table, 2 constrained | 1198 | 819 | 32% |
| 12 column table, 2 constrained | 1289 | 837 | 35% |
| 4 tables x 6 columns, 2 constrained each (whole snippet) | 2921 | 1945 | 33% |
| Downstream consumer, reading models out of an emitted `.d.ts` | 1785 | 1260 | 29% |

Two things drive the gap.

`refineTableType` rebuilds the whole table through a mapped type: it evaluates
`RefinableParamsOf` for every column just to type the refinements argument, then
walks every column again to rebuild `RtTable`. Nine untouched columns cost it 91
instantiations (1198 to 1289). `.format()` merges the one column it is called
on, so the same nine cost it 18 (819 to 837), which is measurement noise around
flat.

The consumer number is the one that matters most: it is paid by every downstream
app, in every editor, on every keystroke. `.format()` cuts it by 29% because the
emitted `.d.ts` carries a per-column `MergeFormat<...>` instead of a whole-table
`RefinedTable<...>` wrapper that has to be unwrapped before anything can be read
out of it.

Declaration emit is clean either way (`emitSkipped=false`, zero diagnostics).
The `.format()` `.d.ts` is about 15% larger in bytes (1532 vs 1338) because
`MergeFormat` is printed per column; that is parse cost, not type cost, and it
did not show up in the consumer measurement.

## Semantics, all verified on the prototype

- Chains in any position: before `notNull()`, after it, before `default()`.
- Chains twice, and the two merge (`.format({minLength: 10}).format({maxLength: 20})`).
- `refineTableType` still stacks on top of a formatted table, and wins on a shared key.
- The compile-error contract is identical to `refineTableType`'s. A column with
  no refinable format refines to `never`, so `boolean('on').format({min: 1})` is
  `TS2345 ... not assignable to parameter of type 'never'`; a param from the
  wrong family is `TS2353 'min' does not exist in type 'Partial<StringParams>'`.
  Neither is ever a silent bypass.
- Runtime is a genuine no-op. It is deliberately NOT recorded, since drizzle's
  own builder has no `format` method and replay would throw. `toDrizzle()` over
  a formatted table produces byte-identical drizzle column config
  (`getTableConfig` verified).
- The existing suites pass unchanged: the pg completeness spec does not object
  to a chain method drizzle lacks, and all four type-budget suites stay green.

## Why it does NOT replace `refineTableType`

Three things `.format()` structurally cannot do.

**One table, one set of constraints.** A format on the column is on the table,
so every model derived from that table carries it. A project with a public API
and an admin API over the same table needs two views of it; `refineTableType`
produces N views from one table, `.format()` produces one.

**The table stops being the database's shape.** `InferInsertModel<typeof users>`
is what you would hand a direct `db.insert()`, a seeder, or an import script.
With `.format()` that type now carries API-level constraints the database does
not have. `refineTableType` keeps `users` honest to the database and puts the
API constraints on a separate `apiUsers`.

**No type-road twin.** A table declared as a type (`tableFromType`) has no
builder chain to hang `.format()` on. Its refinement is the `RefinedTable<T, R>`
type, which stays either way. Adding `.format()` therefore does not remove a
concept from the docs, it adds a second one, and the two roads stop matching.

Neither approach closes the widening hole: `MergeFormat` merges, it does not
check that the new param is stricter, so `.format({maxLength: 200})` on a
`varchar(100)` compiles, exactly as `refineTableType(t, {name: {maxLength: 200}})`
does today. Pre-existing and unchanged by this proposal, but `.format()` sitting
right next to `{length: 100}` makes it much more visible, which cuts both ways.

## Migration from an existing drizzle project

This is where the two diverge most, and it is an argument for keeping
`refineTableType`.

Drizzle validation today is drizzle-zod / drizzle-valibot, which build a
SEPARATE schema object per operation:

```ts
const insertUserSchema = createInsertSchema(users, {
  name: (schema) => schema.min(10),
  age: (schema) => schema.min(18),
});
```

Four properties of that shape decide the migration:

1. **The table is untouched.** Constraints live in a schema module, often a
   different file from the schema definition.
2. **It is per operation.** Insert, select and update schemas can carry different
   constraints on the same column.
3. **It is per use case.** Several schemas are commonly built from one table.
4. **The refinement is an arbitrary callback**, not a params bag.

`refineTableType` maps onto 1 to 3 almost one for one: one `createInsertSchema`
call becomes one `refineTableType` call, in the same file, at the same place in
the module graph. `.format()` requires reaching back into the table definition
and merging constraints from every schema module that refines that table, then
resolving them by hand when two of them disagree. On property 3 it simply cannot
finish, and the leftovers fall back to `refineTableType` anyway.

This matters concretely for the planned codemod
(`docs/todos/drizzle-code-translator.md`): a `refineTableType` translation is a
local rewrite of one call, a `.format()` translation is a cross-module merge with
a conflict case it cannot resolve on its own. The codemod should target
`refineTableType`; `.format()` is for code written fresh against mion.

Property 4 is out of scope for both, unchanged: formats are a fixed catalog, a
`.refine(fn)` callback has no compiled equivalent today.

## What adopting it would cost

- One method on `RtColumnRecorder` (done in the prototype, dialect-agnostic).
- One signature line on each kind interface: 4 in pg, 3 in mysql, 1 in sqlite.
  Eight lines total, and they are mechanical.
- The completeness spec diffs our chain methods against drizzle's builder
  prototypes; `format` is ours and drizzle has no counterpart, so it needs an
  explicit allowlist entry, or a future drizzle upgrade check gets confusing.
  (The spec passed as-is in the prototype, so this is documentation of intent
  rather than a fix.)
- Per-dialect tests: chaining in both positions, double format, stacking with
  `refineTableType`, the two compile errors, the runtime no-op through
  `toDrizzle`, and the paired `getRunTypeId` shapes the Marker rule requires.
- Website `03.drizzle-orm/` gains `.format()` as the default way to constrain a
  column, and has to explain when to reach for `refineTableType` instead, which
  is a real docs cost: two ways to do one thing is what the current page avoids.
- `packages/examples/src/drizzle/` gains a `.format()` example.

## Recommendation

Adopt `.format()` as an addition, not a replacement.

It is cheaper on every measurement, it puts the constraint where the reader is
already looking, and it costs eight signature lines plus one no-op method. The
32% saving on authoring and 29% on every downstream consumer is real and is paid
back on every keystroke.

But `refineTableType` has to stay for the three cases above, and it stays the
migration path for existing drizzle projects. The honest framing for the docs is
"constrain the column where you declare it; derive a second, stricter view of the
table when the API and the database disagree", not "`.format()` replaces
`refineTableType`".
