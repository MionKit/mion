# `.format({...})` on the column chain, instead of `refineTableType`

Status: **SPIKE RESULT — the idea works, is measurably cheaper, and should
become the default.** Recommendation: ship BOTH, `.format()` as the way to
constrain a column, `refineTableType` kept for the one case it is still needed
(a second view of the same table with different rules). Nothing is built yet
beyond the pg prototype this document measures.

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

## What `.format()` costs, and why it is still the better default

An earlier draft of this document claimed `.format()` could not replace
`refineTableType` for three reasons. The invariance finding two sections down
undercuts the first two, so they are restated here honestly.

**The DB-honest model is not usable anyway, so keeping it buys little.** The
argument for `refineTableType` was that `dbUsers` stays the database's shape
while `apiUsers` carries the API rules. But the two views are not
interchangeable: a row from one cannot be handed to anything typed with the
other. In practice a codebase picks ONE view and uses it everywhere, and that
view has to be the refined one, because that is what the routes declare. The
unrefined symbol ends up being a variable nobody reads, and a second name that
is wrong to use.

**And its default fails open.** With `refineTableType` the plain table is the
LOOSE one, so reaching for the wrong symbol gives you unvalidated types. With
`.format()` the plain table is the STRICT one: reaching for it gives you the
stricter contract, and loosening takes a deliberate `refineTableType` call. A
safe default matters more than a tidy one.

**Where the rules actually bite.** A tightened format never breaks plain
TypeScript, because format brands are optional properties, so
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

**The one real cost: a widened view drifts.** Getting a looser view back is
possible but by hand. `MergeFormat` overwrites a key, it never removes one, so
loosening means naming a neutral value for every param the column carries:

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

This is a genuine difference, and it is worth being clear which way it cuts.
`.format()` fails CLOSED: a rule added to the column reaches the loose view too,
so an admin import starts rejecting rows loudly. `refineTableType` fails OPEN:
forget to add the rule to the strict view and the public API keeps accepting
what it should not, silently. A loud break on an internal path is the better
failure of the two, so this counts against `.format()` on ergonomics, not on
safety.

**The type road needs its own marker, and the obvious spelling silently
lies.** See the section below: a `Format<{...}>` marker gives the type road a
real twin. Prototyped and working, so this is build cost, not a blocker.

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

## Drizzle query results vs the API model

This one is NOT about the proposal. It is how `refineTableType` behaves today,
it was untested, and it applies to `.format()` identically. Now pinned by
`packages/type-budget/test/queryModelInterop.test.ts`.

`toDrizzle` synthesizes drizzle column configs from whichever typed view it was
handed, so the view you query THROUGH decides the format params on every row you
get back. Query the refined view and everything lines up:

```ts
const dzApi = toDrizzle(apiUsers);
const rows = await db.select().from(dzApi);
// rows[number] is exactly InferSelectModel<typeof apiUsers>
route(async (): Promise<ApiUser[]> => await db.select().from(dzApi));  // compiles
```

Column projections and joins keep the refined formats too, per table, under
their own keys. And the safety property holds: rows from the UNREFINED view
cannot be returned where the API model was promised.

```ts
route(async (): Promise<ApiUser[]> => await db.select().from(dzDb));  // TS2322
db.insert(dzApi).values(dbShapedPayload);                             // TS2769
```

Both are good errors. `refineTableType` is identity at runtime, so `dzApi` and
`dzDb` are the SAME materialized drizzle table; only the type differs. Without
these errors, querying the wrong view would hand unvalidated rows to a route
that promised validated ones, silently.

**Where it bites: going back the other way.** Format params are compared as
literal types, so whether a refined row still satisfies the unrefined model
depends on what the refinement did to the params:

| Refinement | Effect on the params | Refined row satisfies the DB model? |
| ---------- | -------------------- | ----------------------------------- |
| `{name: {minLength: 10}}` on a varchar | ADDS a key | yes |
| `{age: {min: 18}}` on an integer | OVERWRITES `Int32`'s own `min` | **no** |

```ts
// String<{maxLength: 100; minLength: 10}> -> String<{maxLength: 100}>     ok
// Number<{integer: true; min: 18; ...}>  -> Number<{integer: true; min: -2147483648; ...}>  TS2322
```

So a helper or a write path typed with the DB model rejects an API row, even
though every API row is a valid DB row:

```ts
declare function audit(row: DbUser): void;
audit(refinedRow);                              // TS2345
db.insert(dzDb).values(apiValidatedPayload);    // TS2769
```

This is not a subtyping bug that can be patched away. TypeScript compares
`min: 18` and `min: -2147483648` as unrelated literal types; it cannot know one
bound is inside the other. Numeric columns hit it on every refinement, because
`integer()` already captures `Int32`'s `min` and `max`, so any `{min}` or `{max}`
is an overwrite. String columns only hit it when the refinement touches a
`maxLength` the builder already captured.

The practical rule is one line: **pick one view per table and query through
that one.** Mixing `toDrizzle(users)` and `toDrizzle(apiUsers)` in the same
codebase is what produces these errors, and there is no runtime difference
between them to justify the mixing. On that axis `.format()` is safer by
construction: there is only one table, so there is no wrong view to query
through.

## Underneath it all: format params are invariant

The ADD vs OVERWRITE split above is not a drizzle problem. It reproduces in
`@ts-runtypes/core` with no drizzle in the program at all, and it is the root
cause of every mismatch in the previous section.

```ts
declare const narrow: TF.String<{maxLength: 50}>;
declare const wide:   TF.String<{maxLength: 100}>;

const a: TF.String<{maxLength: 100}> = narrow;  // TS2322
const b: TF.String<{maxLength: 50}>  = wide;    // TS2322

// yet the SAME move via the base compiles, in two steps
const viaBase: string = narrow;
const c: TF.String<{maxLength: 100}> = viaBase; // ok
```

Assignability is not transitive: `A -> string -> B` works, `A -> B` does not.

The cause is `FormatBrand` in
`packages/ts-runtypes/src/runtypes/typeFormat.ts`:

```ts
export interface FormatBrand<Name extends string, Params extends object> {
  readonly [__rtFormatName]?: Name;
  readonly [__rtFormatParams]?: Params;   // TypeScript compares this structurally
}
```

`{maxLength: 50}` and `{maxLength: 100}` are unrelated literal types, so the
property comparison fails. ADDING a key is fine (`{maxLength: 100; minLength: 10}`
is assignable to `{maxLength: 100}`, it just has an extra property);
OVERWRITING a key is not.

**Nothing pins this today.** `packages/ts-runtypes/test/types/typesafety.test.ts`
(`assertionsFormatBranding`) pins format vs its BASE in both directions, and
branded flowing out to unbranded. Every case there uses the same params
(`{maxLength: 5}`). No test anywhere covers two formats of the same family with
DIFFERENT params, which is why this went unnoticed.

**It does not look fixable while `FormatParamsOf` stays precise.** Covariance
annotations, method bivariance and widening the params slot to a union were all
considered: each either still compares the two literal types, or makes
`FormatParamsOf` imprecise and breaks the introspection the Go scanner and the
model types depend on. TypeScript cannot know that `maxLength: 50` sits inside
`maxLength: 100`, which is what soundness here would require.

**The escape hatch already exists.** `StripRunTypeMeta<T>`, whose own doc
comment names "assignability gates over external data" as its purpose, works
both as a cast target and, better, as the declared parameter type:

```ts
declare function audit(row: StripRunTypeMeta<DbUser>): void;
audit(apiRow);   // compiles, any format dressing accepted
```

**Open decision.** Either (a) accept that param sets are invariant, pin it as
intended behaviour, and document `StripRunTypeMeta` as the boundary tool, or
(b) treat format-to-format transparency as the contract, which means giving up
precise `FormatParamsOf`. (a) is the recommendation. Either way it needs a test,
because none exists.

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

Make `.format()` the default way to constrain a column. Keep `refineTableType`
as the narrow tool for the one case that still needs it: a SECOND view of the
same table with different rules.

It is cheaper on every measurement (32% on authoring, 29% on every downstream
consumer, both paid back on every keystroke), it puts the constraint where the
reader is already looking, and it costs eight signature lines plus one no-op
method plus the type-road marker.

The deciding argument is not the cost though, it is that a project can
effectively only work with ONE type per table. Two views of the same table are not interchangeable, so a codebase
has to pick one and use it consistently; `refineTableType` hands you two names
where one is always the wrong one to reach for, and the wrong one is the loose
one. `.format()` removes that choice for the common case and makes the strict
contract the default.

`refineTableType` still has to exist. Widening a formatted column back is the
only way to get a second, looser view, and that is a real need (a public API and
an admin import over one table). But it is the exception, not the shape the docs
should lead with. The framing for the website is "constrain the column where you
declare it; derive a second view only when one table genuinely serves two
contracts", not "two equal ways to do the same thing".

Before building it, the open decision at the end of the invariance section
should be settled, because it is what makes two views awkward in the first
place.
