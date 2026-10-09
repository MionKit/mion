# The slim drizzle recorder architecture

Why the design is what it is, for `@mionjs/drizzle-orm` + `@mionjs/drizzle-orm-<dialect>-core`.
How to author an entry → [SKILL.md](SKILL.md).

## Why not build on drizzle's types

- Stamping formats onto drizzle's own builder generics cost ~12200 net type instantiations per declared model
  (drizzle table + proxy stamps + refineTableType).
- It left every model alias unresolved: each route file, client and npm consumer re-ran the whole drizzle chain.
- It broke declaration emit.
- Slim removes drizzle from the type-level foundation: drizzle = runtime target, materialized on demand.

## One authoring surface, drizzle-shaped, all ours

- Table written as a drizzle table: same function names, config, extraConfig, helpers.
- One difference: a column takes every setting in ONE props object, drizzle's config keys + modifier calls together:
  `varchar('name', {length: 100, notNull: true, default: ['x']})`. No-arg modifier = `true`, else its args tuple.
- Every authoring function comes from OUR packages, returns a slim object RECORDING the call, never runs drizzle.
- Record lives at runtime only, as internal closures on the object. Nothing of it enters the type system.
- Wrapped:
  - column builders (every manifest `column` entry), each taking every drizzle modifier its builder has as a props key;
  - table factories (both drizzle overloads: columns object, or callback receiving the column helpers)
    + the extraConfig callback;
  - constraint/index/enum/schema/sequence/policy/role helpers, keeping drizzle's chains
    (an index takes `on()` first, then its options);
  - the `sql` tagged template, recorded with its embedded values (slim columns + `tableRef()` values included),
    rebuilt with drizzle's real `sql` at materialization.

## Lazy materialization

- `toDrizzle(table)` (each dialect's `./drizzle` subpath) = the ONE module importing drizzle-orm.
- Traverses the recorded graph, passes the drizzle namespace into each element's materializer, memoizes per table.
- Replays each column's props as modifier calls in key order. Drizzle's builders are config objects whose modifiers
  mutate + return `this`, so replay reproduces the exact hand-written table.
- Result IS a genuine drizzle table: queries, migrations, getTableConfig all work on it.
- Authoring imports nothing from drizzle → drizzle-orm = OPTIONAL peer. Schema, models, validators work without it.

## Slim types

- Column type = ONE optional spec sentinel `Column<Fn, Props, Data, Base>` (stored as `{fn, config, data, base}`):
  - builder fn; raw props; builder's intrinsic flags;
  - format-mapped data (varchar length -> String<{maxLength}>, integer -> Int32,
    timestamp mode -> Date/StringDateTime, enum tuples -> literal unions).
- No methods, no db name, no owning table: same shape in two tables = ONE type, one runtype node.
- Builder returns exactly this type → builder table IS its hand-written twin (`Varchar<{length: 100; notNull: true}>`).
- Db names that differ from the key live on the table's names map. Only `toDrizzle` reads them.
- Flags (notNull, hasDefault, insertExcluded, the key flags) derive from props where a model reads them,
  never at declaration.

Two reflection constraints shaped this. No measurement shows them:

- **A column type carries no methods.** The runtype id walks method return types. A chain returning a column with new
  props per call never repeats a type → hits the 512-level cap (marker-self-instantiating-generic). Hence no chains.
- **No alias may carry the builder record as a type argument.** The resolver serializes an aliased type's arguments,
  so `pgTable` and `pgView` spell their column and names maps inline.

Props interfaces + `*ColMods` bags (method sets) → [authoring.md](authoring.md#props-interfaces--new-modifier).

- `Only<P, Allowed>` rejects a stray key in both. A `const` type parameter + a weak type would otherwise let it through.
- Every props reader (the recorder, the runtime bridge, the Go convert program) splits it by `colModNames`.
- Every shape measured on the way here: `packages/drizzle-orm/TYPE-COST.md`.

## Models and refinement, flat

- `InferSelectModel/InferInsertModel` (drizzle's exact names): each ONE mapped pass directly over the columns record.
  Measured alternative (RowOf intermediate through the mion modelTypes utilities) cost ~1.7x.
- Semantics mirror drizzle's operations.d.ts:
  - select: `Data | null` for nullable columns;
  - insert: requires notNull-without-default, defaulted optional, excludes generatedAlwaysAs + identity-always columns;
  - update: any subset of insert.
- `refineTableType`: identity at runtime. Merges format params flat over slim columns with
  MergeFormat/RefinableParamsOf from @mionjs/run-types's refineFormat.
- A refinement that does not fit the column = compile error.

## Package layout

- Layout + file map → [SKILL.md](SKILL.md#packages).
- All four packages ride the drizzle versionLine.
- Dialect packages depend on the root by minor-aligned peer range + workspace devDependency.

## Where drizzle types are paid

- Only `toDrizzle`'s return type references drizzle. It synthesizes structural column configs from the slim state.
- Fixed `dataType: 'custom'` / `columnType: 'RtColumn'`. Only data, notNull, hasDefault, generated, identity vary:
  the only fields drizzle's model/query typing reads.
- Live costs per step, db-query step included (paid only in db files): packages/private-type-budget/reports/.

## The safety net

- **Equality matrices**: each dialect's typeTables.spec.ts + index.spec.ts, plus its fuzz suite
  (tableEquality.fuzz.spec.ts, 120 random tables per run): getTableConfig of toDrizzle(slim) deep-equals raw drizzle.
- **Completeness specs**: diff drizzle's builder methods against our props interfaces both ways.
  A drizzle upgrade adding a modifier fails visibly.
- **Manifest gate** (committed manifests + gen-drizzle-manifest --check): covers every drizzle export,
  root drizzle-orm module included.
- **Drizzle-free pin** (type-budget drizzleFreeAuthoring.test.ts): compiles the authoring surface program-wide
  with drizzle-orm unresolvable, keeping the optional-peer promise.
