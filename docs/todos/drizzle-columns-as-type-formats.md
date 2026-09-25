---
type: feature
spec: full-plan
status: ready
created: 2026-09-25
---

# Drizzle columns as type formats: one column type for builders and hand-written tables

## Why this exists

Today a slim drizzle table can be declared two ways, and they do not produce the same type:

```ts
// builder road
const users = pgTable('users', {name: varchar('name', {length: 100}).notNull()});
// type road
type UsersTable = PgTable<'users', {name: Varchar<'name', {length: 100; notNull: true}>}>;
```

Only their MODELS are equal (pinned). The tables and columns are not: `typeof users` is not assignable to `UsersTable`:

```
Type 'RtTypedColumn<UUID, true, false, false, { fn: "uuid"; name: "id"; ... }>' is missing the following
properties from type 'RtPgUuidColumn<UUID, true, false, false>': notNull, default, $default, $defaultFn, and 9 more.
```

The goal: make drizzle columns work like runtypes type formats. A column type is data plus OPTIONAL metadata (like `TypeFormat = Base & FormatBrand<Name, Params>`, where the brand members are optional sentinels). The builders are thin functions whose return type IS the hand-written type, exactly as the runtypes builders return `RunType<T>` with `InferType` giving the type-first `T`. Long term the owner wants type formats and columns to share one architecture under the hood.

**Decision rule (from the owner):** build the new system AS A SEPARATE FEATURE, side by side with the current one, so both can be compared at any point. Try optimisations along the way. Decide to switch (or not) only once it is finished. Do NOT trust earlier cost notes blindly, including the rejections recorded in `packages/drizzle-orm/TYPE-COST.md`: re-measure them against the new code.

## What is already known (do not lose this)

### 1. Why the two roads differ today (opposite designs)

- **Runtypes builders put everything in the TYPE.** The runtime value is thin; the build step injects an id (`InjectRunTypeId<T>`) and the resolver reflects `T`. Child args are `CompTimeArgs` and discarded at runtime (`packages/run-types/src/builders/compose.ts:401`).
- **Drizzle builders put everything in the RUNTIME object.** `RtColumnRecorder` records each call and replays it into drizzle at `toDrizzle()` (`packages/drizzle-orm/src/recorder.ts`, `table.ts:materializeRtTable`). The builder's TYPE is only a summary: data + 3 flags, `RtColumnBrand<Data, NotNull, HasDefault, InsertExcluded>` (`recorder.ts:43`), plus chain methods on per-dialect kind interfaces (`RtPgColumn`, `RtPgDateColumn`, `RtPgUuidColumn`, `RtPgIntColumn`, pg `columns.ts:66-148`).
- **The type road** (`RtColType` -> `RtTypedColumn`, `packages/drizzle-orm/src/typeColumns.ts:38,241`) carries the db name, config and modifiers in optional sentinels (`rtColSpecKey`, `rtColModsKey`, `rtColumnKeyFlagsKey`) so `tableFromType<T>()`, `toDrizzle<T>()` and `mion convert` can rebuild the table from the type alone.

### 2. Constraints that must hold in the new design

- **The runtime stays a recorder.** drizzle-kit loads the schema file with its own loader, WITHOUT mion's build step, so no injected id exists there. Builders must keep working with zero build step (this is also what makes `mion drizzle-migrate` a drop-in swap). Only the TYPES change.
- **Builders keep drizzle's exact call shape by default** (`varchar('name', {length: 100}).notNull().default(...)`), because `mion drizzle-migrate` and the drizzle-e2e lane translate drizzle's own suites onto these packages. The owner allows one exception: the single-call fallback in Phase 2, if chained modifiers stay too costly.
- **Some things have no type spelling today**: callbacks (`$defaultFn(() => ...)`), `sql` with interpolated values, `default(new Date())`, `extraConfig` callbacks, `customType` (runtime `toDriver`/`fromDriver`). Today the type road passes callbacks through `tableFromType({runtime, tables})` and convert refuses the rest (CNV009). The new design keeps that contract as the FALLBACK, and Phase 1b below (the owner's idea) gives the callbacks a type spelling through pure functions.
- **Declaration emit**: symbol-keyed members only print in a `.d.ts` behind a NAMED interface (the `FormatBrand` lesson, `packages/run-types/src/runtypes/typeFormat.ts:33`). Every sentinel carrier in the new design must be a named, exported interface. `packages/private-type-budget/test/declarationEmit.test.ts` pins this (it also counts `RtPgIntColumn` in the emitted table, so it needs updating for the new names).
- **drizzle-orm stays an optional peer**: `drizzleFreeAuthoring.test.ts` must pass for the new system too.
- **Id contract**: a builder table and its hand-written twin must reflect to the SAME runtype id, in both `getRunTypeId` call shapes (Marker test coverage rule, `ts-go-runtypes/CLAUDE.md`).

### 3. Prototype results from the investigation (cut-down prototype, read the warning below)

Measured with `makeMeasurer` from `packages/run-types/test/types/compileHarness.ts` and `RESOLVING_OPTIONS` from `packages/private-type-budget/test/modelPipelineHarness.ts`, over the real packages. Net instantiations, lower is better. Absolute numbers from this ad-hoc harness differ a little from `reports/type-road.md` (different import header); compare within one run only.

| Case | Current builders | Current types | Prototype, types | Prototype, builders |
|---|---:|---:|---:|---:|
| 5 mixed columns, select model | 512 | 906 | 403 | 632 |
| 5 mixed + insert model | 978 | 1372 | 859 | 1197 |
| 20 plain columns | 328 | 1321 | 708 | 693 |
| 20 plain, no db names | | | 214 | |

All `Equal<>` pins passed: the prototype builder table IS the prototype hand-written table, and both select and insert models equal today's models exactly.

The prototype (reproduce it first, it is the starting point):

```ts
declare const colKey: unique symbol;
interface ColBrand<Fn extends string, Name, P, D> { readonly [colKey]?: {fn: Fn; name: Name; props: P; data: D} }
type Flat<T> = {[K in keyof T]: T[K]};
interface Chain<Fn extends string, Name, P, D> {
  notNull(): Col<Fn, Name, Flat<P & {notNull: true}>, D>;
  primaryKey(): Col<Fn, Name, Flat<P & {primaryKey: true}>, D>;
  defaultNow(): Col<Fn, Name, Flat<P & {defaultNow: true}>, D>;
}
type Col<Fn extends string, Name, P, D> = ColBrand<Fn, Name, P, D> & Chain<Fn, Name, P, D>;
interface PTable<Name extends string, Cols> { name: Name; columns: Cols }

// hand-written column types: the SAME Col, so builder output and hand-written types are identical
type PVarchar<Name, P extends {length?: number; notNull?: true; primaryKey?: true} = {}> =
  Col<'varchar', Name, P, P extends {length: infer L extends number} ? Str<{maxLength: L}> : Str>;
type PText<Name, P extends {enum?: readonly string[]; notNull?: true} = {}> =
  Col<'text', Name, P, P extends {enum: infer E extends readonly string[]} ? E[number] : Str>;

// builders: drizzle's call shape. Strip `readonly` from const tuples or `Equal` fails
declare function pvarchar<N extends string, L extends number>(name: N, config: {length: L}): Col<'varchar', N, {length: L}, Str<{maxLength: L}>>;
declare function ptext<N extends string, const E extends readonly [string, ...string[]]>(name: N, config: {enum: E}):
  Col<'text', N, {enum: {-readonly [I in keyof E]: E[I]}}, E[number]>;

// models compute flags LAZILY from the raw props, one `infer` per column
type BrandOf<C> = C extends {readonly [colKey]?: infer B} ? NonNullable<B> : never;
type NNKeys = 'notNull' | 'primaryKey';
type DefKeys = 'defaultNow' | 'default';
type SelVal<B> = B extends {props: infer P; data: infer D} ? (Extract<keyof P, NNKeys> extends never ? D | null : D) : never;
type PSelect<T extends PTable<string, unknown>> = {[K in keyof T['columns']]: SelVal<BrandOf<T['columns'][K]>>};
type InsReq<B> = B extends {props: infer P} ? (Extract<keyof P, NNKeys> extends never ? false : Extract<keyof P, DefKeys> extends never ? true : false) : never;
type PInsert<T extends PTable<string, unknown>> = Flat<
  {[K in keyof T['columns'] as InsReq<BrandOf<T['columns'][K]>> extends true ? K : never]: SelVal<BrandOf<T['columns'][K]>>} &
  {[K in keyof T['columns'] as InsReq<BrandOf<T['columns'][K]>> extends true ? never : K]?: SelVal<BrandOf<T['columns'][K]>>}>;
```

**Why the current type road costs more** (most likely, to be confirmed by isolating it): every hand-written column computes all its flags EAGERLY at declaration (`typeColumns.ts:44-52`: `WithArray<WithTypeOverride<...>>`, `ModNotNull`, `ModHasDefault`, `ModInsertExcluded`, plus `ColNameArg`/`ColConfigArg` on the dual-argument alias), even when nothing reads them. The prototype stores raw props and derives flags only inside the models.

**What costs in the prototype:**
- **Builders**: each chained call merges its setting into one flat object (`Flat<P & {...}>`), or the result would not be `Equal` to the hand-written literal. Without `Flat`, `P & {notNull: true}` is assignable but not identical.
- **Db names INSIDE each column type**: 20 columns cost 708 with names vs 214 without. The cost is not the name, it is WHERE the prototype put it: as a type argument of every column (`c0: PInteger<'c0'>; c1: PInteger<'c1'>`), so every column is a distinct type (plus its brand and chain interfaces) that TypeScript builds separately. Nameless, `c0: PInteger<undefined>; c1: PInteger<undefined>` are twenty references to ONE cached type. This is why the first strategy (section 4) keeps db names out of column types entirely and stores them at the TABLE level, the way collection type formats keep metadata on the collection. The prototype above still has the `Name` parameter; drop it.

### 4. Shared columns: no db name and no table name inside a column type (FIRST strategy)

**Owner's decision: a column type holds NO db name and NO owning table.** Then the same column type is one shared type across every table that uses it, which cuts type cost AND runtypes cache entries. That reuse is the reason runtypes are type based, not code based. Db names and anything table-specific live at the TABLE level (see "Db names at the table level (primary design)" in Phase 1).

How drizzle does it, for comparison: it stores BOTH in the column. Builder types carry the column's db name (`_['name']`, `''` when nameless) and `pgTable` runs a mapped pass that stamps the table name into every column type (`node_modules/drizzle-orm/column-builder.d.ts:232`, `BuildColumns` -> `BuildColumn<TTableName, ...>` -> `PgColumn<MakeColumnConfig<..., TTableName>>`); at runtime every column has `.table`. So every drizzle column type is unique to its table, which is part of why drizzle's types are heavy. We match drizzle's CALL shapes, not this internal type layout.

**References without an owner on the column.** Put the table/key info only in the REFERENCE view, not in the table or column types: `cols(teams)` (`packages/drizzle-orm/src/table.ts:60`, today an identity cast) returns a mapped view `{[K in keyof Cols]: Cols[K] & Owner<TableName, K>}`, so `references(() => cols(teams).id)` still records `{table: 'teams'; column: 'id'}`. The mapping is paid only where `cols()` is called (references, and the extraConfig column param, which is already a mapped type today: `PgExtraConfigColumns`, pg `table.ts:112`). Owner metadata stored on the table's own column types (below) is the BACKUP if this does not work. Note `teams.id` alone does not type-check today either (the table type is its metadata), so `cols()` is already the required spelling.

### 4b. Backup: owner metadata on columns (prototyped, works, costs more)

The table pushes its name and each column's key into the column, like collection formats add metadata that `InferType` strips:

```ts
declare const ownerKey: unique symbol;
interface Owner<T extends string, K> { readonly [ownerKey]?: {table: T; key: K} }
type Owned<N extends string, C> = {[K in keyof C]: C[K] & Owner<N, K>};
interface PTable<N extends string, C> { name: N; columns: Owned<N, C> }
type RefOf<R> = R extends {readonly [ownerKey]?: infer O} ? (O extends {table: infer T; key: infer K} ? {table: T; column: K} : never) : never;
// in Chain:
references<R extends Owner<string, unknown>>(ref: () => R): Col<Fn, Name, Flat<P & {references: [RefOf<R>]}>, D>;
```

- `references(() => cols(teams).id)` produces `{references: [{table: 'teams'; column: 'id'}]}`, `Equal` to the hand-written spelling (the same `ColRef` shape the type road uses today, `typeColumns.ts:119`).
- Cost, two tables with one reference: current builders 267, prototype by hand 318, prototype builders 518.
- **Self-reference does not work without an annotation** (same as today's builders and drizzle itself):
  ```
  TS7022 'emps' implicitly has type 'any' because it does not have a type annotation and is referenced directly or indirectly in its own initializer.
  ```
  With `(): AnyCol => cols(emps).id` it compiles but the table name widens to `string`, so the builder table no longer equals the hand-written one. Proposed fix: a named helper for the return type, `(): SelfRef<'emps', 'id'> => cols(emps).id`, which keeps the literal names. NOTE: the investigation found NO self-reference test anywhere today (no drizzle package, test, example, Go convert/migrate code or e2e addendum), so none of today's behaviour is pinned either.
- The measurement harness uses `noImplicitAny: false`, which hides TS7022 as a silent `any`. Self-reference tests must run with `noImplicitAny: true, strict: true`.

### 5. Precomputing `ToDrizzleTable` in Go: measured, NOT worth it

With all info in the type, the Go program could emit the drizzle table type directly. Measured on a 4-column table with the same select / insert / update queries:

| Case | Steps |
|---|---:|
| slim table + `toDrizzle` + query (today) | 8046 |
| same, drizzle table type already written out | 7344 |
| plain drizzle `pgTable` + query | 9481 |
| slim table + `toDrizzle`, read one column, no query | 398 |

It saves about 700 (around 9%). The other ~7300 are drizzle's own query generics, which Go cannot remove. And it would tie the Go program to drizzle's internal `PgColumn` config shape (`packages/drizzle-orm-pg-core/src/drizzle.ts:55-90`), which is not public and changes between drizzle versions, on top of the TypeScript version it already tracks. Keep `ToDrizzleTable` in TypeScript.

### 6. History: designs already tried (re-measure, do not trust blindly)

From `packages/drizzle-orm/TYPE-COST.md` and the done specs. The owner's instruction is to re-measure these against the new code, not to skip them:

- **"Full ColumnFormat, modifiers merged by a mapped type"** (`Merge<P, {notNull: true}>` per builder call): +223% declaring a 5-column builder table (314 -> 1013), +146% with select model, +51% with both models, +117% at 40 columns. This is the SAME mechanism as the prototype's `Flat` per chain call. The prototype measured only +23% on 5 mixed columns (512 -> 632) but +111% on 20 plain (328 -> 693): re-measure at full vocabulary and at 40 columns.
- **"ColumnFormat, modifiers accumulated by intersection"** (every prop optional, `P & {notNull: true}`, models probe with one `extends`): -39% at 5 columns, -25% at 10, -6% at 20, +11% at 40. Recorded as "a stripped prototype, the win is illusory". The same warning applies to this investigation's prototype.
- **"Flattening the columns to bags"** (a per-table mapped pass to `{data, notNull, hasDefault, insertExcluded}`): +1% at 5 columns to +29% at 40.
- **Empty-modifier fast path** (`[keyof Mods] extends [never]`): saves ~18 per plain column, costs ~16 per modified one. Rejected.
- **Splitting props inside the type with `Pick`** so readers need no name list: +48 to +57 per configurable column. Rejected; the 18-name `colModNames` list in two readers is the cheaper price.
- **Brand spelling for the dialect**: type parameter +4 per table, declared in core and narrowed per dialect +9, fixed literal on a per-dialect interface 0 (shipped).
- **One table type per dialect**: +2 per table on the builder road, taken deliberately for design reasons.
- **Traps recorded there** (follow them): consume the model into annotated consts (a bare alias measures nothing); check the errors (a broken prototype once reported a fake 57% win); isolate before attributing (measure with the feature removed); measure what a change ENABLES, not just the change as written; a cut-down prototype always looks good next to the real code.

## Plan

Pg first, full vocabulary, side by side with the current system. Mysql and sqlite only after the owner decides to switch.

### Phase 0: reproduce and extend the measurements

1. Add a comparison suite `packages/private-type-budget/test/columnFormats.compile.test.ts` that measures, in ONE run, the current builders, the current type road, the new hand-written types and the new builders on the SAME shapes: the 8 cases of `typeRoad.compile.test.ts` (5 mixed, 5 mixed + insert, 20 plain, wide vocabulary), plus 10 and 40 plain columns, nameless columns, two tables with a reference, `refineTableType`, and the `toDrizzle` + query step. Every case consumes its model into annotated consts, and the suite fails on any type error (the harness's `errors` list). Write its report to `packages/private-type-budget/reports/column-formats.md` (committed) so any change shows in the diff.
2. Budgets on the NEW cases are one-way downward like every other suite, but the current cases are the reference line, not a gate on the new code.
3. Isolate the claim in section 3: measure the current type road with the eager flag computation replaced by raw props (same sentinels), to confirm where its cost comes from.

### Phase 1: the new column types (pg, full vocabulary), side by side

Build under `packages/drizzle-orm/src/next/` (core) and `packages/drizzle-orm-pg-core/src/next/` (pg). NO new package export and NO `package.json` change until the switch decision: tests and the budget suite import these files by relative path (`allowImportingTsExtensions` is on). The shipped surface stays exactly as it is.

- **Column type** = one named optional sentinel interface carrying `{fn, props, data}` plus a chain interface, like the prototype but with NO db name and NO owner (section 4). Two columns with the same builder and props are ONE type, in any table. Measure BOTH spellings the owner described:
  - (a) metadata-only object (the prototype), data read from the sentinel;
  - (b) `Data & ColumnMeta<...>`, the column IS its data type with optional metadata, exactly like `TypeFormat = Base & FormatBrand`. Nominal brands stay opt-in, never forced.
- **Keep the reflected shape readable by today's readers where possible.** `fromType.ts` (`readColumnSpec`/`applyMods`, `:124-215`) and Go `internal/convert/drizzle.go` (`specFromGraph`, `:1190-1536`) match sentinels by the CONST NAME suffix (`@rtColSpecKey`, `@rtColModsKey`, `@rtTableBrand`, `@rtEntrySpecKey`, `@rtSqlTextKey`) and read plain members `fn`, `name`, `config`, `name`/`columns`/`extras`, `table`/`column`. Keep the sentinel const names (`rtColSpecKey`, `rtColModsKey`, `rtTableBrand`, ...) and member names (`fn`, `config`, `columns`, `extras`) where the new design allows, so the readers change as little as possible. They WILL change in one place: the db name moves from the column spec (`fromType.ts:124-150`, `drizzle.go:1312`) to the table. During Phases 0 to 3 the readers can gain a second path for the new shape (the old one stays for the current system). A single-sentinel variant (`{fn, props, data}` only) is an optimisation to measure; adopting it means changing `drizzle.go:42-45, 1302-1407, 1230, 1420, 1482` and `fromType.ts:98, 125, 174, 245, 309` together.
- **Db names at the table level (primary design).** A column type never holds its db name. The common case is NAMELESS: the record key is the db name, optionally mapped by drizzle's `casing` option (`snake_case` / `camelCase` on the db config), and needs nothing in the type. An explicit name (`integer('c_0')`) goes into a names map on the table meta, listing only the columns whose db name differs from the key. The builder catch: `integer('c_0')` gets the name at the column call, so either the builder column type carries it until `pgTable` lifts it into the map (a pass over the columns, measure it and check the lifted column is then the shared nameless type), or another spelling is found. Whatever wins, the builder table must stay `Equal` to the hand-written one. `ColRef {table, column}` already uses the record KEY, not the db name, so references are not affected.
- **Full modifier vocabulary**, per kind, mirroring drizzle's method sets: the 18 names in `colModNames` (`typeColumns.ts:90`) and the pg kind split (common / date + `defaultNow` / uuid + `defaultRandom` / int + identity). Keep the per-kind props bags (today `PgColMods` etc., `columns.ts:158-178`) so `Varchar<'v', {autoincrement: true}>` stays a compile error.
- **Everything today's type road derives, derived lazily in the models instead**: notNull (`notNull`, `primaryKey`, both identities, intrinsic `notNull`), hasDefault (all default-ish modifiers, the four `$` runtime markers, generated, identity, sqlite pk autoIncrement config, intrinsic flags), insertExcluded (`generatedAlwaysAs`, `generatedAlwaysAsIdentity`), `array` (`Data[]`), `$type` override, key flags for mysql `$returningId()` and pg `overridingSystemValue()`. Source of truth for every rule: `typeColumns.ts:186-237`.
- **Intrinsic builder flags** (pg `serial`/`smallserial`/`bigserial` start notNull + hasDefault, `columns.ts:214,566,589`) ride the column's `fn` or a base member; decide which is cheaper by measuring.
- **Chain methods live on the column type itself**, so a hand-written column and a builder column are the same type. The chain interface is generic, so its members are only instantiated when read.
- **Builder chain cost: try in this order and keep the cheapest that stays `Equal`**: `Flat<P & {...}>` per call (prototype); intersection per call plus ONE normalization at `pgTable` (then only tables, not loose columns, must be `Equal`); per-method specific merges; anything else the measurements suggest. `const` type parameters must strip `readonly` or `Equal` fails (seen with `enum` tuples).
- **Table type** = `PgTable<Name, Columns, ...>` holding the shared column types unchanged, plus table-level metadata (the names map, extras). No owner on its columns. References go through the `cols()` view from section 4 so `references(() => cols(x).id)` records `{table, column}`; owner metadata on columns (section 4b) is the backup. Add the `SelfRef<Table, Key>` helper for self-references.
- **Runtypes cache check**: two tables sharing a column shape must produce ONE shared entry for that column in the reflected cache. Measure the cache module size against today (the table brand change measured -7 to -8% there, `TYPE-COST.md` "The reflected graph is where it actually pays").
- **Models** (`InferSelectModel`, `InferInsertModel`, `InferUpdateModel`, `InferSelectViewModel`) for the new columns, computing flags from props lazily. Their results must be `Equal` to today's models for every twin table.
- **`refineTableType` / `RefinedTable`** for the new columns: merge format params into the data while keeping `fn` and props (and the table-level names map and extras). Today's version (`refine.ts:23-46`) rebuilds a bare `RtColumnBrand` and drops the rest (see "Findings" below).
- **`toDrizzle` / `ToDrizzleTable` / `SynthConfig`** for the new columns: the same synthesized drizzle config as today (`drizzle.ts:55-90`), flags read from props. Keep it in TypeScript (section 5). **This is the ONE place table-specific data goes back into columns (owner's rule):** drizzle's column types carry the db name and the table name (`BuildColumns`, `node_modules/drizzle-orm/column-builder.d.ts:232`: `name` is the builder's db name, or the record key when nameless; `tableName` is the table's). `ToDrizzleTable` rebuilds both from the table-level metadata (the names map and the table name), so that cost is paid only in files that call `toDrizzle` and run queries, never in routes, models or the client.
  - Current divergence to check and fix here: today's `SynthConfig` always sets `name: K`, the record KEY (`drizzle.ts:56-62`), while drizzle uses the explicit db name when one is given. Verify with a test whether anything in drizzle's query typing reads it (for example `getTableColumns`, relational queries, aliases); either way the new `ToDrizzleTable` must match drizzle exactly.
- **Views** (`pgView(name, columns)`, pg `views.ts:61`) accept the new columns.
- **Enums and custom types**: `pgEnum(...)` columns (`helpers.ts:124`, `makeEnumFactory` `table.ts:255`), `pgSchema(...).enum`, and `customType` have no type-road alias today. Give them a column type in the new system so models work; `tableFromType`/convert may keep refusing them (their runtime needs a handle or callbacks), but that refusal must be explicit and tested.
- **Runtime**: reuse `RtColumnRecorder`, `createRtTable`, `materializeRtTable` unchanged. Only types are new.
- **Naming**: follow repo style (no `I`/`T` prefixes, `InjectRunTypeId` casing). Shared types go in the package's `types.ts`.

### Phase 1b: runtime callbacks as pure functions (owner's idea)

Today a table type can only say `{$defaultFn: true}`; the callback itself must be passed again through `tableFromType({runtime: {col: {$defaultFn: fn}}})` or `toDrizzle<T>({runtime})`, and both readers check the flag and the callback match (`fromType.ts:183-193, 219-229`, Go `fillRuntimeCallbacks` `drizzle.go:1941-1970`). Mion already has a way to give an inline function a build-time identity: **pure functions**.

- `PureFunction<F>` marks a callback argument; `InjectPureFnId<F>` is the trailing id the build injects (`packages/run-types/src/markers.ts:189, 216`). Registrars: `registerPureFn` / `registerPureFnFactory` (`packages/run-types/src/runtypes/pureFn.ts:85-99`).
- The closest existing pattern is the client's `inputFrom(source, mapper: PureFunction<...>, id?: InjectPureFnId<...>)` (`packages/rpc-client/src/batch.ts:80`): the build extracts the inline mapper, gives the call site its id and ships the body, so the server can run it by id.
- Go side: marker scanning in `ts-go-runtypes/internal/compiler/marker/`, batch mappers in `internal/compiler/requestbatch/`, pure-fn diagnostics `PFN001` (inline shape) and `PFE9006`-`PFE9011` (purity).
- Rules a pure fn must follow (`container/website/content/02.runtypes/02.guide/09.pure-functions.md`, section "Pure Function Rules"): self-contained, no outer captures, no `this`, no `await`/`yield`, no dynamic import, sync only; `Math`, `JSON`, typed arrays, `crypto.randomUUID` are fine. A helper can reach another pure fn through `registerPureFnFactory` + `utl.usePureFn(id)`.

What to design and prototype:
1. **Which drizzle hooks can take a pure fn**: `$default`, `$defaultFn`, `$onUpdate`, `$onUpdateFn`, and `customType`'s `toDriver` / `fromDriver`. Check whether `default(new Date())` can be written as a pure `$defaultFn(() => new Date())` (check `Date` against the purity rules).
2. **How the column type carries it**: e.g. `{$defaultFn: [PureFnRef<...>]}` instead of `{$defaultFn: true}`, so `tableFromType<T>()` resolves the body from the pure-fn registry (`getRTUtils().getCompiledPureFnByKey(id)`) with no `runtime` option, and `mion convert` can round-trip the callback. Investigate how the id reaches the TYPE: at author time the injected id is absent, so `PureFnId<ID>` is `PureFnId<string>` in source (the literal only appears in an emitted `.d.ts`, `pureFn.ts:38-43`). Options: the Go resolver resolves the call-site id while reflecting the table type, or a hand-written type references an exported registered id (`typeof myDefault`).
3. **Opt-in, never forced.** Real drizzle schemas use callbacks that capture imports (`() => createId()` from a library), which break the purity rules. `mion drizzle-migrate` must keep translating those. So either an explicit wrapper marks a pure callback, or the pure form is a separate overload; a non-pure callback keeps today's `runtime` option contract. Decide which by prototype.
4. **No build step still works.** Under drizzle-kit there is no injected id. `inputFrom` throws without an id (`batch.ts:94-99`), but a column builder must not: the recorder keeps the live function and replays it, and only the type road needs the id. (`$defaultFn` is app-side only and never reaches migrations, but the schema file still has to load.)
5. **Tests**: a pure `$defaultFn` column round-trips builders -> type -> `tableFromType` with no `runtime` option; a non-pure callback still works through `runtime`; a purity violation reports the pure-fn diagnostic at the call site; the id is stable across builds.

### Phase 2: optimise and compare

**Fallback if chained modifiers stay a big handicap (owner's call):** switch the builders to the runtypes style, where ALL params go in one call instead of a chain:

```ts
// drizzle style (today)
varchar('name', {length: 100}).notNull().default('x')
// single-call style: the props object IS the hand-written one, so the builder returns Varchar<'name', P> directly, no merge
varchar('name', {length: 100, notNull: true, default: ['x']})
```

This breaks the 1:1 match with drizzle's function shapes, so everything that relies on that match must move with it:
- `mion drizzle-migrate` (`ts-go-runtypes/internal/drizzlemigrate/`) must fold a modifier chain into the single call. The logic already exists: convert's builders -> type direction walks a chain into exactly this props object (`columnFromChain`, `internal/convert/drizzle.go:880-1007`, spelling rule: no-arg call = `true`, call with args = args tuple). Reuse it, do not write a second walker.
- The runtime recorder must split the props back into drizzle's config argument plus modifier calls at replay, the same split `fromType.ts` already does by `colModNames` (`readColumnSpec`/`applyMods`, `fromType.ts:124-215`).
- `mion convert` builders <-> type becomes almost a rename.
- The drizzle-e2e lane (drizzle's own suites translated by drizzle-migrate) must still pass.
- The docs promise "the same names, parameters, modifier chains" as drizzle (`00.drizzle-overview.md`, intro); that text and the migrate page change.
- Consider keeping BOTH: single-call as the cheap default, the chain kept for drop-in drizzle code, and measure what the chain costs only where it is used.

**Backup if shared, nameless columns do not work:** put the db name (and, if needed, the owner from section 4b) back inside the column type, as the prototype did. Measure it against the primary design so the cost of the fallback is known.

Iterate on the Phase 1 code with the comparison suite. Try at least: how `pgTable` lifts explicit names into the table map (and the backup of names inside columns), the single-call style above, sentinel layout (two sentinels vs one), spelling (a) vs (b), the builder merge strategies above, nameless vs named columns, the empty-modifier fast path and the `Pick` split again (both previously rejected: re-measure), and anything the `tsc --generateTrace` output points at. Record every attempt, kept or rejected, with numbers, in a new section of `packages/drizzle-orm/TYPE-COST.md`. Correct any older conclusion that the new measurements contradict.

### Phase 3: owner decision (stop here)

Present the comparison report to the owner: cost per case for all four lines (plus the single-call builders if tried), whether chained builders are kept, dropped or kept beside single-call, what the new system gains (one type, `references` typed, cheaper hand-written tables if it holds) and loses (builder cost). The owner decides. Do not start Phase 4 without that decision.

### Phase 4 (only if the owner decides to switch)

Replace the current column types with the new ones in pg, then port mysql (3 kinds: `RtMyColumn`, `RtMyIntColumn` + `autoincrement`, `RtMyTimestampColumn` + `defaultNow`/`onUpdateNow`, no `array`, `mysqlEnum` builders-only today, serial intrinsic `autoincrement`) and sqlite (2 kinds: `RtSqliteColumn` with two `primaryKey` overloads, `RtSqliteIntColumn` where any primary key is the rowid, intrinsic `primaryKeyHasDefault`). No compatibility shim for the old types (repo convention). Everything that must move together:

- `packages/drizzle-orm/src/`: `recorder.ts` (brand types), `typeColumns.ts`, `models.ts`, `refine.ts`, `table.ts`, `view.ts`, `fromType.ts`, `index.ts` exports. Delete what becomes dead, including the already-dead exports `ColNotNullOf`, `ColHasDefaultOf`, `ColInsertExcludedOf` (`recorder.ts:50-52`), `AnyRtColType` (`typeColumns.ts:64`), `ColSpecOf` (`typeColumns.ts:186`).
- Each dialect: `columns.ts` (kinds, bags, aliases, builders), `table.ts` (`PgTable`, extra-config column types, entry aliases), `helpers.ts` (index/unique/foreignKey/primaryKey column params typed `AnyRtColumn`), `views.ts`, `drizzle.ts` (`SynthConfig`).
- Note: `rtColumnKey` also brands `RtSql`, `RtIndexedColumn`, the `*EntryBrand`s and `RtLinkedPolicy` (`recorder.ts:134,161`, pg `helpers.ts:19,109`), so `ColBrandOf` on those returns a non-column payload. Keep those separate from the column sentinel.
- Go, only if the reflected shape changes: `ts-go-runtypes/internal/convert/drizzle.go` sentinel constants and `specFromGraph`. Go never reads builder-road column TYPES (builders -> type reads only the AST), so builder types changing needs no Go change by itself. `drizzlemigrate` is unaffected.
- Regex-based gates that parse the source layout and will break on renames: `packages/drizzle-orm/test/modifierParity.ts`, `test/colMods.spec.ts`, `test/manifest-coverage.spec.ts`, each dialect's `test/manifest-coverage.spec.ts`. The drizzle-slim-schemas skill (`.claude/skills/drizzle-slim-schemas/SKILL.md` and `ARCHITECTURE.md`) lists the sync points; update it.
- Budgets: `typeRoad.compile.test.ts`, `modelPipeline*`, `laneComparison*` will move. Any increase is a reviewed exception called out in the PR and commented where the budget lives (the suites' header rule).

## Tests

- **Type pins (compile-time `Equal<>`)**, new file per dialect next to `test/type-pins.stub.ts`: builder table `Equal` to its hand-written twin, for the narrow case, the wide vocabulary (serial, enum text, identity, array, `$type`, unique, defaultNow, runtime markers), references across tables, and a self-reference with `SelfRef`. Select / insert / update models `Equal` to TODAY's models for the same table. The same column declared in two different tables is ONE type (`Equal` on `cols(a).x` vs `cols(b).y` stripped of the reference view), both nameless and with explicit db names. Bag rejections (`@ts-expect-error` for a modifier the kind does not have). Run with `strict: true`.
- **Runtime parity**: `getTableConfig(toDrizzle(newBuilderTable))` equals `getTableConfig(toDrizzle(currentBuilderTable))` and equals the raw drizzle table, over the same shapes as `test/typeTables.spec.ts`. `tableFromType<NewHandType>()` rebuilds the same table.
- **Id convergence**: builder table and hand-written twin get the same runtype id, both `getRunTypeId` call shapes as paired tests (Marker test coverage rule).
- **Self-reference on the CURRENT road too**: add the missing test today's code lacks (builder road with an annotation, type road with a thunk in `options.tables`).
- **Declaration emit and drizzle-free authoring** for the new system (`declarationEmit.test.ts`, `drizzleFreeAuthoring.test.ts` patterns).
- **Go**: `go -C ts-go-runtypes test ./internal/... ./cmd/...`; `internal/convert/drizzle_test.go` runs against the live TS sources via `internal/testfixtures/realdrizzle.go`, so any sentinel change is caught there. Add a self-reference convert round trip.
- **Budget suite**: the comparison suite from Phase 0.
- **drizzle-e2e**: `pnpm miondevx core drizzle-translate --to-types` on the host during development; the `drizzle-e2e` lane before any switch (Phase 4).

## Fuzzing

Yes, cheap oracle. Extend the pg table fuzz (`packages/drizzle-orm-pg-core/test/tableEquality.fuzz.spec.ts`, `tableSpecShared.ts`) to generate each random table in BOTH new spellings (builders and hand-written) and check: same `getTableConfig` after `toDrizzle`, same runtype id, and models equal to the current system's. Follow the fuzzy-testing skill.

## Docs

During Phases 0 to 3: none, because nothing public changes (the new code has no export).
Phase 4 (if switched), in `container/website/content/01.rpc/04.drizzle-orm/`:
- `00.drizzle-overview.md`, existing section "Writing a Table as a Type": builders and table types are now the same type; one short example with `typeof users` used as the type.
- `03.constraints.md`, existing section "Referencing Another Table": the `SelfRef` helper for self-references.
- `07.migrate-an-existing-schema.md`, existing section "Converting to Pure Types": update if convert's output changes.
- `packages/private-examples/src/drizzle/`: add a builders-equals-types example if a page imports it.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Out of scope

- A mion query builder or ORM, and replacing drizzle-kit (migrations and studio). The owner has a separate idea for strongly typed migrations based on type overrides; it gets its own spec. This redesign keeps it possible: once a table type holds everything, a migration can be a comparison of two table types.
- Precomputing `ToDrizzleTable` in the Go program (section 5).
- A type road for views, and type-only spellings for interpolated `sql` and non-pure callbacks (pure callbacks are Phase 1b).
- mysql and sqlite before the Phase 3 decision.

## Done when

- Phases 0 to 2 are done for pg: the comparison suite runs, its report is committed, every optimisation attempt is recorded in `TYPE-COST.md` with numbers, and the new builders produce a table `Equal` to the hand-written one across the full vocabulary, references and self-references.
- All tests above pass for the new system; the current system is untouched and its budgets unchanged.
- The owner has the comparison and has decided. If the decision is to switch, Phase 4 is done for all three dialects, the drizzle-e2e lane passes (label `drizzle-e2e`, plus `pre-publish-e2e` because public types change), and the docs above are updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source file, each committed on its own.

## Findings from the investigation

Fold into this work (same files):
- `SynthConfig` sets the drizzle column `name` to the record key even when an explicit db name exists (`packages/drizzle-orm-pg-core/src/drizzle.ts:56-62`, same in mysql and sqlite); drizzle uses the db name. Covered in Phase 1 (`toDrizzle` bullet).
- `refineTableType` rebuilds a bare `RtColumnBrand` (`refine.ts:23-39`), so a refined column loses its key flags (`rtColumnKeyFlagsKey`). A refined mysql table passed to `toDrizzle` may type `$returningId()` wrong. The new `refineTableType` must keep all column metadata; verify the current behaviour with a test first.
