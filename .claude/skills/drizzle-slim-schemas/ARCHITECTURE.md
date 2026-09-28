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

A table is written as a drizzle table: same function names, same config, same
extraConfig, same helpers. The one difference is the column: it takes every
setting in ONE props object, drizzle's config keys and its modifier calls
together (`varchar('name', {length: 100, notNull: true, default: ['x']})`; a no-arg
modifier is `true`, one with arguments its args tuple). Every authoring function
comes from OUR packages and returns a slim object RECORDING the call instead of
running drizzle. The record lives at runtime only, as internal closures on the
object; nothing about it enters the type system. Wrapped:

- the column builders (every manifest `column` entry), each taking every drizzle
  modifier its builder has as a props key;
- the table factories (both drizzle overloads: columns object, or a callback
  receiving the column helpers) plus the extraConfig callback;
- the constraint/index/enum/schema/sequence/policy/role helpers, which keep
  drizzle's chains (an index takes `on()` first, then its options);
- the `sql` tagged template, recorded with its embedded values (slim columns and
  `tableRef()` values included) and rebuilt with drizzle's real `sql` at
  materialization.

## Lazy materialization

`toDrizzle(table)` (each dialect's `./drizzle` subpath) is the ONE module that
imports drizzle-orm. It traverses the recorded graph, passes the drizzle
namespace into each element's materializer, replays each column's props as the
modifier calls in key order (drizzle's builders are config objects whose modifiers mutate and return
`this`, so replay reproduces the exact hand-written table), and memoizes per
table. The result IS a genuine drizzle table: queries, migrations,
getTableConfig all work on it. Because authoring imports nothing from drizzle,
drizzle-orm is an OPTIONAL peer: schema, models and validators work without it.

## Slim types

A column type is ONE optional spec sentinel, `Column<Fn, Props, Data, Base>`: the
builder fn, the raw props, the format-mapped data (varchar length ->
String<{maxLength}>, integer -> Int32, timestamp mode -> Date/StringDateTime, enum
tuples -> literal unions) and the builder's intrinsic flags. No methods, no db
name, no owning table, so the same shape in two tables is ONE type and one runtype
node. A builder returns exactly this type, which makes a builder table IS its
hand-written twin (`Varchar<{length: 100; notNull: true}>`); db names that differ
from the key live on the table's names map, and only `toDrizzle` reads them. The
flags (notNull, hasDefault, insertExcluded, the key flags) are derived from the
props where a model reads them, never at declaration.

Two constraints from reflection shaped this, and no measurement shows them:

- **A column type carries no methods.** The runtype id walks method return types;
  a chain returning a column with new props per call never repeats a type and hits
  the 512-level cap (MKR009). Hence no chained modifiers.
- **No alias may carry the builder record as a type argument.** The resolver
  serializes an aliased type's arguments, so `pgTable` and `pgView` spell their
  column and names maps inline.

**Props interfaces group builders by drizzle's METHOD SETS** (pg four: common /
+defaultNow / +defaultRandom / +identity; mysql three; sqlite one), with the
`*ColMods` bags as their column-type twins. `Only<P, Allowed>` rejects a stray key
in both, which a `const` type parameter and a weak type would otherwise let through.
Every reader of a props object (the recorder, the runtime bridge and the Go convert
program) splits it by `colModNames`. See `packages/drizzle-orm/TYPE-COST.md` for
every shape measured on the way here.

## Models and refinement, flat

`InferSelectModel/InferInsertModel` (drizzle's exact names)
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
factories, helpers, props interfaces, column types) and re-exports nothing. All
four packages ride the drizzle versionLine; the dialect packages depend on the
root by minor-aligned peer range plus workspace devDependency.

## Where drizzle types are paid

Only `toDrizzle`'s return type references drizzle: it synthesizes structural
column configs from the slim state (fixed `dataType: 'custom'` /
`columnType: 'RtColumn'`; only data, notNull, hasDefault, generated, identity
vary, the only fields drizzle's model/query typing reads). The live costs of each
step, the db-query step included (paid only in db files), are in
packages/private-type-budget/reports/.

## The safety net

- **Equality matrices** in each dialect's typeTables.spec.ts and index.spec.ts plus
  each dialect's fuzz suite (tableEquality.fuzz.spec.ts, 120 random tables per run):
  getTableConfig of toDrizzle(slim) deep-equals the raw drizzle build.
- **Completeness specs** diff drizzle's builder methods against our props
  interfaces in both directions, so a drizzle upgrade adding a modifier fails visibly.
- **The manifest gate** (committed manifests + gen-drizzle-manifest --check)
  covers every drizzle export, the root drizzle-orm module included.
- **The drizzle-free pin** (type-budget drizzleFreeAuthoring.test.ts) compiles
  the authoring surface program-wide with drizzle-orm unresolvable, keeping the
  optional-peer promise honest.
