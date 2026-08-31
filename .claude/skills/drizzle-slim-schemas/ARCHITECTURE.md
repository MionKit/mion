# The slim drizzle recorder architecture

The durable architecture reference for `@mionjs/drizzle-orm` and the
`@mionjs/drizzle-orm-<dialect>-core` packages. SKILL.md tells you HOW to author
an entry; this file records WHY the design is what it is.

## Why not build on drizzle's types

Stamping formats onto drizzle's own builder generics priced a single declared
model at ~12200 net type instantiations (drizzle table + proxy stamps +
refineTableType), left every model alias unresolved so each route file, client
and npm consumer re-ran the whole drizzle chain, and broke declaration emit.
The slim architecture removes drizzle from the type-level foundation entirely:
drizzle is a runtime target materialized on demand.

## One authoring surface, drizzle-shaped, all ours

A table is written exactly as a drizzle table: same function names, same call
params, same modifier chains, same extraConfig, same helpers. Every authoring
function comes from OUR packages and returns a slim object RECORDING the call
instead of running drizzle. The record lives at runtime only, as internal
closures on the object; nothing about it enters the type system. Wrapped:

- the column builders (every manifest `column` entry) and their full modifier
  chains;
- the table factories (both drizzle overloads: columns object, or a callback
  receiving the column helpers) plus the extraConfig callback;
- the constraint/index/enum/schema/sequence/policy/role helpers, which chain
  exactly like columns, so the same record-and-replay applies;
- the `sql` tagged template, recorded with its embedded values (slim column
  refs included) and rebuilt with drizzle's real `sql` at materialization.

## Lazy materialization

`toDrizzle(table)` (each dialect's `./drizzle` subpath) is the ONE module that
imports drizzle-orm. It traverses the recorded graph, passes the drizzle
namespace into each element's materializer, replays the modifier list 1:1
(drizzle's builders are config objects whose modifiers mutate and return
`this`, so replay reproduces the exact hand-written table), and memoizes per
table. The result IS a genuine drizzle table: queries, migrations,
getTableConfig all work on it. Because authoring imports nothing from drizzle,
drizzle-orm is an OPTIONAL peer: schema, models and validators work without it.

## Slim types

The builder chain carries only what models need:
`RtColumnBrand<Data, NotNull, HasDefault, InsertExcluded>`. The format mapping
(varchar length -> String<{maxLength}>, integer -> Int32, timestamp mode ->
Date/StringDateTime, enum tuples -> literal unions) lives in the builders' own
return types. Modifiers that do not affect models return the type untouched;
`primaryKey()` implies notNull, mirroring drizzle. `toDrizzleColumn` restores
everything else from the recorded params, so no other column metadata rides a
type.

**Kind interfaces group builders by drizzle's METHOD SETS** (pg four: common /
+defaultNow / +defaultRandom / +identity; mysql three; sqlite one), not one
interface per column. Common methods are redeclared per kind because each must
return its own interface: an intersection loses the extras after chaining, and
`this` types cannot change the flag generics.

**A named data type per column builder** (Varchar, Integer, Timestamp, ...):
the pure-types vocabulary. A hand-written row using these names gets exactly
the types the builders infer; the builders' return Data types reference the
same aliases, so the pair cannot drift. Type pins assert the equality per
column.

A column type takes the db name and ONE props object holding the builder's own
config keys and its modifier calls (`Varchar<'name', {length: 100; notNull:
true}>` for `varchar('name', {length: 100}).notNull()`; no-arg call is `true`,
with-args is the args tuple). It expands STRAIGHT to the same `RtColumnBrand`
the builders return, which is what lets `TypedCols` pass a whole authored record
through wholesale instead of converting it column by column. The two readers
that replay the calls (the runtime bridge and the Go convert program) split the
props object by modifier name; the *ColMods bags constrain each column type to
its own builder's modifiers. See `packages/drizzle-orm/TYPE-COST.md` for what
the earlier carrier-plus-normalization shape cost.

## Models and refinement, flat

`InferSelectModel/InferInsertModel/InferUpdateModel` (drizzle's exact names)
are each ONE mapped pass directly over the columns record; the measured
alternative (a RowOf intermediate routed through the mion modelTypes
utilities) cost ~1.7x. The semantics mirror drizzle's operations.d.ts: select
gives `Data | null` for nullable columns; insert requires
notNull-without-default, makes defaulted optional, excludes generatedAlwaysAs
and identity-always columns; update is any subset of insert.

`refineTableType` is identity at runtime and merges format params flat over
the slim columns with MergeFormat/RefinableParamsOf from
@mionjs/run-types's refineFormat; a refinement that does not fit the column is
a compile error.

## Package layout

`@mionjs/drizzle-orm` is the dialect-agnostic core (recorders, table core,
models, refinement, sql). Consumers import that shared surface from it
DIRECTLY; a dialect package exports only its own local surface (columns,
factories, helpers, kind interfaces, named types) and re-exports nothing. All
four packages ride the drizzle versionLine; the dialect packages depend on the
root by minor-aligned peer range plus workspace devDependency.

## Where drizzle types are paid

Only `toDrizzle`'s return type references drizzle: it synthesizes structural
column configs from the slim state (fixed `dataType: 'custom'` /
`columnType: 'RtColumn'`; only data, notNull, hasDefault, generated, identity
vary — the only fields drizzle's model/query typing reads). Measured (TS 6.0.3,
drizzle-orm 0.45.2, committed under packages/type-budget/reports/): the model
path costs 493 + 1245 + 673 net instantiations vs 11504 through the old proxy
chain; the db-query step costs 7676, paid only in db files; an npm consumer
reading the emitted d.ts pays 1841 vs 4205 before.

## The safety net

- **Equality matrices** in each dialect's index.spec.ts plus the pg fuzz suite
  (tableEquality.fuzz.spec.ts, 120 random tables per run): getTableConfig of
  toDrizzle(slim) deep-equals the raw drizzle build.
- **Completeness specs** diff our chain-method sets against drizzle's builder
  prototypes, so a drizzle upgrade adding a modifier fails visibly.
- **The manifest gate** (committed manifests + gen-drizzle-manifest --check)
  covers every drizzle export, the root drizzle-orm module included.
- **The drizzle-free pin** (type-budget drizzleFreeAuthoring.test.ts) compiles
  the authoring surface program-wide with drizzle-orm unresolvable, keeping the
  optional-peer promise honest.
