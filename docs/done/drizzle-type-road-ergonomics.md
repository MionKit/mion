---
type: feature
spec: guidelines
status: done
created: 2026-08-28
---

# Drizzle type-road ergonomics: marker bridges, runtime options, PgTable return type, Table naming

## Intent

The pure-type table road (docs/done/drizzle-type-defined-tables.md, PR #165) works
but review surfaced rough edges in the public spelling, and one missing capability.
Nothing is published yet, so rework the API freely in its own PR, no compatibility
shims and no migration notes needed. Decisions taken with the developer
(2026-08-28 session):

- The canonical pair must not repeat the type name nor force a visible
  getRunType call.
- RT suffixes are reserved for actual runtypes: table types use a Table suffix
  (UsersTable) and table consts drop RT everywhere.
- DB.pgTable (and the other dialects) should genuinely return
  PgTable<Name, Cols> so one public name describes both roads.
- Runtime-function modifiers ($defaultFn, $onUpdate, ...) join the type road
  through the bridge call instead of staying builders-only.

## Direction

Verified starting points; the implementer plans the details.

1. Marker overloads. Wrapper injection works for any function declaring the
   trailing `id?: InjectRunTypeId<T>` param (wrapper note at
   packages/ts-runtypes/src/markers.ts:12); the injected entry tuple can only be
   resolved by forwarding it to core's getRunType at runtime, so the marker
   forms make @ts-runtypes/core a RUNTIME peer of the module hosting them
   (accepted; keep the scope tight, e.g. the ./drizzle subpath already carries
   runtime deps, and the package root stays core-free if practical).
   - `toDrizzle<UsersTable>(options?)` on each dialect's ./drizzle subpath:
     the happy path for query/migration files.
   - `tableFromType<UsersTable>(options?)`: the general bridge. The explicit
     `tableFromType(runType, deps?)` form stays as the low-level escape hatch.
2. Runtime options paired with type markers. The options object gains a
   `runtime` map of per-column callbacks
   (`{id: {$defaultFn: () => crypto.randomUUID()}}`) replayed on the recorders
   after the type-derived modifiers; matching marker interfaces
   (RuntimeDefault, RuntimeOnUpdate, ...) carry the HasDefault flag into the
   type so value-free files still derive correct models; the bridge validates
   marker and callback match both ways and throws naming the column. Convert
   then translates `.$defaultFn(cb)` between the builder chain and the options
   object by moving the callback text verbatim (removing that CNV009 refusal
   class; refusals shrink to interpolated sql and non-literal args). The
   byte-fixpoint and twin oracles extend to runtime modifiers.
3. Type-level refine is the type road's refine. `RefinedTable<T, R>` already
   exists (packages/drizzle-orm/src/refine.ts:50) but leaves R unconstrained:
   constrain it with `TableRefinements<T>` and document
   `type ApiUsersTable = RefinedTable<UsersTable, {...}>`. No refineTableType
   marker overload (it would build a value only to shape a type).
4. Builders return the dialect table type. pgTable/mysqlTable/sqliteTable
   declare PgTable/MysqlTable/SqliteTable as their return types
   (packages/drizzle-orm-pg-core/src/table.ts:44,128): the normalization
   passes already-branded builder columns through unchanged, and the extras
   meta member becomes optional so builder values are assignable. Type-budget
   step 1 must not regress (cheapen types, never raise budgets).
5. Naming sweep. Table types take the Table suffix; table consts drop RT in
   every example, doc and spec (usersRT becomes users/usersTable + UsersTable).
   Convert's invented-name derivation appends/strips RT
   (ts-go-runtypes/internal/convert/names.go:97); keep that for the generic
   runtype pairs (there the const IS a runtype) and add a drizzle-specific
   Table-suffix rule.
6. tableFromType keeps two documented jobs only: the convert pair's emitted
   const (a converted builders file must keep exporting the value other files
   import) and the `tables` deps for cross-table references; plus the runtime
   options above. Docs demote it from the happy path.

Same discipline as PR #165: horizontal slices, every change lands with the twin
oracles (both getRunTypeId call shapes), fuzz corpus extensions, convert round
trips, docs and examples in the same pass.

## Out of scope

Interpolated sql stays unrepresentable; mysqlEnum and sqlite's int stay
builders-only; the sibling drizzle-code-translator todo.

## Done when

A type-road file needs no getRunType and never repeats a name; a table using
$defaultFn/$onUpdate round-trips through convert and passes the twin oracles;
the dialect table factories declare their dialect table types as returns; no
RT-suffixed table names remain in examples, docs or canonical pairs; type
budgets are unchanged or lower; all landed in one follow-up PR to #165 with no
compatibility layers for the old spellings.

## Plan — approved 2026-08-29

Target spelling:

```ts
export type UsersTable = DB.PgTable<'users', {...}>;
export const users = DB.toDrizzle<UsersTable>();     // ./drizzle subpath, happy path
export const users = DB.tableFromType<UsersTable>(); // package root, general bridge
// escape hatch stays: tableFromType(getRunType<UsersTable>(), options?)
```

Decisions refined during planning (they adjust the Direction sketches):

1. The runtime-modifier markers are `$Default` / `$DefaultFn` / `$OnUpdate` /
   `$OnUpdateFn`, not RuntimeDefault/RuntimeOnUpdate: they follow the existing
   `method ↔ upperFirst(method)` rule `$Type` already uses, so convert needs no
   mapping tables and the $default vs $defaultFn alias survives the byte
   fixpoint in the type itself. All four set HasDefault.
2. The options object is `TableFromTypeOptions<T> = {tables?, runtime?}` (full
   rename of TableFromTypeDeps). It must stay all-optional (weak type) forever:
   that is what keeps the `(runType, options?)` / `(options?, id?)` overload
   pair disjoint. The bridge validates marker↔callback both ways in applyMods
   and replays via the existing recorder methods; the memo stays
   first-call-wins (now covering options), documented in the jsdoc.
3. The dialect package ROOT gains a runtime import of @ts-runtypes/core
   (getRunType only); @mionjs/drizzle-orm stays runtime-core-free.
4. `PgTable`'s `extras` meta member stays REQUIRED (making it optional would
   reflect as a union and silently drop indexes/checks/FKs). The builders
   declare `PgTable<TName, Cols>` returns via a NormalizeCol pass-through
   branch for already-branded builder columns; no assignability work needed
   because the impl signatures declare no return.
5. Go naming: drizzle-only derivations `UsersTable ⇄ users` (fallback
   usersTable, then digits) at drizzle.go's two call sites; the generic
   RT-suffix derivation stays for runtype pairs.
6. Convert emits the marker-form pair (no getRunType); the recognizer keeps
   accepting the explicit form and canonicalizes it. CNV009 narrows: the four
   `$` runtime methods translate (callback text moved verbatim between chain
   and options literal); `$type` gets a dedicated refusal; interpolated sql,
   non-literal args and out-of-file references stay refused.
7. Related bug fixed in-scope: the emitted type-form pair for references
   tables never emitted `tables` deps, so it threw at import time. Convert now
   emits `{tables: {...}}` and refuses (CNV009) backward references whose deps
   object would hit a temporal dead zone.

Slices, in order (Go fixture tests mount the real JS packages, so JS first):
S1 runtime markers + options bridge (explicit form) · S2 marker overloads for
tableFromType/toDrizzle · S3 builder return types + RefinedTable constrained to
TableRefinements · S4 Go marker-form template + tables deps + naming ·
S5 Go runtime-fn translation · S6 naming/docs sweep and spec move. Each slice
lands with its tests (paired marker call shapes per the Marker rule); fuzzing =
extending the existing convert/convertcli/drizzletypes corpora, no new suite.

## Shipped (2026-08-29)

All six directions landed in one PR on the plan above, with these refinements
found during implementation:

- The marker naming is $Default/$DefaultFn/$OnUpdate/$OnUpdateFn (the
  upperFirst-after-$ rule $Type already used), not RuntimeDefault/RuntimeOnUpdate:
  zero mapping tables in convert, and the $default vs $defaultFn alias survives
  the byte fixpoint in the type itself.
- PgTable's extras meta member stays REQUIRED (an optional member reflects as a
  union and would silently drop indexes/checks/FKs). The factories declare the
  dialect table types via a lazily-defaulted NormalizedCols fast-path parameter,
  so a builder table never evaluates the TypedCols conditional.
- Type budgets came out LOWER, not just unchanged: RefineCols reads the brand in
  one conditional and the flat RtTableMetaWithExtras replaced the meta
  intersection; budgets ratcheted down (step1 493->478, step2 1245->1198,
  consumer 1841->1785).
- Related bug fixed in scope: the emitted type-form pair for References tables
  never emitted its deps, so it threw at import time. Convert now emits
  {tables: {parent: parents}} and refuses backward references (CNV009 reorder
  message) whose eagerly-evaluated option would hit a temporal dead zone.
- Naming in the examples: the slim table const is `users`; a materialized
  drizzle table exported next to it is `usersDb`.
- Post-review amendment: the explicit tableFromType(runType, options?)
  overload was DROPPED entirely — tableFromType has one signature,
  `tableFromType<T>(options?)`. Dynamic callers holding a resolved graph use
  the exported buildRtTableFromGraph instead; convert's pairing still ignores
  value arguments, and converting a builders file always emits the marker
  form.
