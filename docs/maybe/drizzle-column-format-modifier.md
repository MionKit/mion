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

Behaviour is pinned by `packages/drizzle-orm-pg-core/src/formatModifierSpike.spec.ts`.

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

Three things `.format()` cannot do, or cannot do yet.

**One table, one set of constraints.** A format on the column is on the table,
so every model derived from that table carries it. A project with a public API
and an admin API over the same table needs two views of it; `refineTableType`
produces N views from one table, `.format()` produces one.

**No loose model is left to derive.** Measured, not assumed: a tightened format
never breaks plain TypeScript, because format brands are optional properties, so
`{name: 'ann', age: 7}` still assigns to every one of these models. The
difference shows up only in the compiled validator.

```ts
const short = {id: ID, name: 'ann', age: 7};
createValidateFn<InferInsertModel<typeof dbUsers>>()(short);  // true, the db's own shape
createValidateFn<InferInsertModel<typeof apiUsers>>()(short); // false, the refined view
createValidateFn<InferInsertModel<typeof fmtUsers>>()(short); // false, the formatted column
```

`refineTableType` leaves `dbUsers` untouched, so the loose model stays available
to derive. `.format()` puts the rule on the column, so there is no loose model
left: the table IS the API shape.

Getting a looser view back is possible but by hand. `MergeFormat` overwrites a
key, it never removes one, so loosening means naming a neutral value for every
param the column carries:

```ts
const fmtAdminUsers = refineTableType(fmtUsers, {name: {minLength: 1}, age: {min: 0}});
```

That works, and it drifts. Add one more rule to the column six months later and
the loose view, which never mentions it, silently inherits it:

```ts
name: varchar('name', {length: 100}).notNull().format({minLength: 10, pattern: namePattern}),
// fmtAdminUsers says {name: {minLength: 1}} and nothing about pattern,
// so the admin import path starts rejecting rows it used to accept.
```

Pinned in `packages/drizzle-orm-pg-core/src/formatModifierSpike.spec.ts`. Under
`refineTableType` the same change lands on the strict view only and the loose
one is untouched, because the rule never reached the table.

**The type road needs its own marker, and the obvious spelling silently
lies.** See the section below: a `Format<{...}>` marker gives the type road a
real twin, but it is extra work, and until it exists the two roads do not match.

Neither approach closes the widening hole: `MergeFormat` merges, it does not
check that the new param is stricter, so `.format({maxLength: 200})` on a
`varchar(100)` compiles, exactly as `refineTableType(t, {name: {maxLength: 200}})`
does today. Pre-existing and unchanged by this proposal, but `.format()` sitting
right next to `{length: 100}` makes it much more visible, which cuts both ways.

## The type road: a twin exists, but not the obvious one

A table declared as a type (`tableFromType`) has no builder chain to hang
`.format()` on, so the first question is whether the format can just be
intersected into the column type. Measured, it cannot:

```ts
// A: compiles, and minLength is SILENTLY DROPPED. Params stay {maxLength: 100}.
type T = PgTable<'user', {name: Varchar<'name', {length: 100}> & RTString<{minLength: 10}> & NotNull}>;
```

A column's data comes from the `Varchar<...>` spec sentinel, so an intersected
format type is simply not read. No error, no constraint, and nothing to notice
at the call site. That spelling has to be rejected outright, not documented.

`$Type<>` does work, because it replaces the data type wholesale:

```ts
// B: works, but you must RESTATE every captured param. Forget maxLength: 100
// and the database's own constraint is gone, again silently.
type T = PgTable<'user', {name: Varchar<'name', {length: 100}> & $Type<RTString<{minLength: 10; maxLength: 100}>> & NotNull}>;
```

The real twin is a `Format<P>` marker beside the existing `NotNull` / `$Type`
markers, which MERGES instead of replacing. Prototyped and verified:

```ts
// packages/drizzle-orm/src/typeColumns.ts
export interface Format<Params> {
  readonly [rtColModsKey]?: {format: [Params]};
}
type WithFormat<Data, Mods> = Mods extends {format: [infer Params]} ? MergeFormat<Data, Params> : Data;
// ...folded into ColDataOfSpec, after the $type override, before the array wrap
```

```ts
// D: params merge, pinned by Expect<Equal<Pd, {maxLength: 100; minLength: 10}>>
type T = PgTable<'user', {name: Varchar<'name', {length: 100}> & Format<{minLength: 10}> & NotNull}>;
```

| Type-road spelling | Result | Net instantiations, one column |
| ------------------ | ------ | -----------------------------: |
| no constraint (baseline) | n/a | 640 |
| `& RTString<{minLength: 10}>` | silently ignored | 653 |
| `& $Type<RTString<{...}>>` | replaces, must restate every param | 726 |
| `& Format<{minLength: 10}>` | merges correctly | 1069 |

Deltas over the baseline: the `Format<>` marker costs 429 for one column, in the
same band as the builder chain's `.format()` (about 410) and cheaper than
`refineTableType` (about 490). Materialization needs no change at all:
`literalValueOf` already walks nested object literals, so the marker replays as
`format({minLength: 10})` on the recorder, which is the same no-op.

**The catch, and it is a real one.** The builder-road `.format()` constrains its
argument (`P extends RefinableParamsOf<Data>`), so a wrong-family param is a
compile error. A marker interface cannot do that: it is declared standalone and
intersected in, so it never sees the column's data type. Measured on the
prototype, both of these compile with NO diagnostic:

```ts
Varchar<'name', {length: 100}> & Format<{min: 10}>  // a number param merges into a string format
PgBoolean<'on'> & Format<{min: 1}>                  // a column with no refinable format, ignored
```

Closing that needs validation inside `NormalizeCol` (resolve the column to
`never`, or to an error-carrying type, when the params do not match the family).
That is not in the prototype and it is the main unknown left in this proposal.

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
- The type road's `Format<P>` marker plus the `WithFormat` fold (done in the
  prototype, dialect-agnostic), AND the family validation in `NormalizeCol`
  that the prototype does not have.
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

But `refineTableType` has to stay for the reasons above, and it stays the
migration path for existing drizzle projects. The honest framing for the docs is
"constrain the column where you declare it; derive a second, stricter view of the
table when the API and the database disagree", not "`.format()` replaces
`refineTableType`".
