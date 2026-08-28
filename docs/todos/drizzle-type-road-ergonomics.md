---
type: feature
spec: guidelines
status: ready
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
