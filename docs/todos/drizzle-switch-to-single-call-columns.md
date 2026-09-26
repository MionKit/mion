---
type: feature
spec: full-plan
status: blocked
created: 2026-09-25
---

# Switch all three drizzle dialects to the single-call column system

## Why this exists

A second column system lives beside the shipped one, measured and tested, in
`packages/drizzle-orm/next/` and each dialect package's `next/`. pg has it now; the mysql and
sqlite `next/` is built first, by its own change, and this switch waits for it. The owner decided
to switch in two parts, and this spec is the second: the new system replaces the shipped column,
table and builder types in all three dialects at once, and everything that relied on drizzle's
chained call shape follows. It is one step because the core package, `mion convert` and
`mion drizzle-migrate` serve every dialect.

What the new system is, in one screen:

```ts
// a column type: its spec only, no methods, no db name, no owning table
interface Column<Fn, Props, Data, Base> {readonly [rtColSpecKey]?: {fn: Fn; config: Props; data: Data; base: Base}}

// builders take EVERY setting in one props object, spelled exactly as the hand-written type spells it
const users = pgTable('users', {
  id: uuid('id', {primaryKey: true, defaultRandom: true}),
  name: varchar('user_name', {length: 100, notNull: true, unique: ['uq_name']}),
  teamId: integer('team_id', {references: [() => tableRef(teams, 'id'), {onDelete: 'cascade'}]}),
  slug: text({$defaultFn: [() => crypto.randomUUID()]}),   // the type records {$defaultFn: true}
  meta: jsonb({$type: $type<{tags: string[]}>()}),          // the type records {$type: [{tags: string[]}]}
});
// ...is exactly this type: db names that differ from the key sit on the table
type Users = PgTable<'users', {
  id: Uuid<{primaryKey: true; defaultRandom: true}>;
  name: Varchar<{length: 100; notNull: true; unique: ['uq_name']}>;
  teamId: Integer<{references: [TableRef<Teams, 'id'>, {onDelete: 'cascade'}]}>;  // = {table: 'teams'; column: 'id'}
  slug: Text<{$defaultFn: true}>;
  meta: Jsonb<{$type: [{tags: string[]}]}>;
}, [], {name: 'user_name'; teamId: 'team_id'}>;
```

The prop rule is the old modifier rule: a no-argument call is `true`, a call with arguments is
its argument tuple. Only the keys that hold functions change on the way to the type: a
`references` thunk records the `{table, column}` its `tableRef()` returns, a runtime callback
records `true`. `TableRef<Teams, 'id'>` checks the column key; `TableRef<'emps', 'id'>` takes a
table name, for a self-reference.

## What is already known (do not lose this)

### Measured, 2026-09-25 (`packages/private-type-budget/reports/column-formats.md`)

| Shape | shipped builders | shipped types | new types | new builders |
|---|---:|---:|---:|---:|
| 5 mixed, select | 570 | 971 | 683 | 1160 |
| 5 mixed, select + insert | 1036 | 1437 | 1276 | 1827 |
| 40 plain, db name per column | 565 | 2418 | 480 | 993 |
| wide vocabulary | 676 | 1175 | 873 | 1516 |
| refineTableType | 1341 | 1768 | 1421 | 1918 |

pg numbers, after the stray-key check (`Only<P, Allowed>`); mysql and sqlite have their own rows in the report.
| toDrizzle + three queries | 8643 | 9461 | 8812 | 9915 |

- Hand-written tables cost about what shipped builders cost, and 45 to 80% less than the
  shipped type road.
- New builder tables cost 70 to 90% more than shipped builders on narrow tables. The
  declaration itself is close; the gap is the models deriving flags from props where the
  shipped builders carry four ready booleans. This is the one number the switch makes worse,
  and the budgets in `typeRoad`, `modelPipeline` and `laneComparison` will move with it.
- Every attempt, kept or rejected, is in `packages/drizzle-orm/TYPE-COST.md`, section "Side by
  side: columns as type formats". Read it before optimising anything.

### Constraints the design rests on (each one cost a debugging session)

- **A column type carries no methods.** The runtype id walks method return types
  (`ts-go-runtypes/internal/cachegen/runtype/typeid/typeid.go`, `signatureID`); a chain that
  returns a column with new props per call never repeats a type and hits the 512-level cap as
  MKR009. This is why there are no chained modifiers.
- **No alias may carry a builder record as a type argument.** The resolver serializes an aliased
  type's arguments (`cachegen/runtype/serialize.go`, `projectType`), so `pgTable` and `pgView`
  spell their column map and names map INLINE in the return type. An alias here also printed the
  record twice in a `.d.ts`; inline, the `.d.ts` prints the resolved columns. The resolver's
  escape hatch `isBuilderInternalAlias` is a name list limited to the run-types package.
- **`pgTable` constrains its record to `Record<string, object>`.** A union of column shapes
  cost 663 against 386 to declare five named columns. A non-column value still shows up as
  `never` in the models.
- **Builder props are written-out interfaces** (`PgColIn`, `PgDateIn`, `PgUuidIn`, `PgIntIn` in
  `next/columns.ts`), not `Omit<bag> & runtime keys`: every call checks its props against one.
- **`const` config tuples must be made writable by a mapped type over a BARE type parameter**
  (`MutableTuple` in `next/columns.ts`), or an enum tuple stops being a tuple and a builder
  column stops equalling its hand-written twin.
- **A builder table's type records no `extraConfig` entries** (`Extras = []`), exactly like the
  shipped builder road. A builder table equals its hand-written twin only when the twin has no
  extras; columns, names and models always agree. Capturing typed entries is a separate idea.
- **Helper types that appear in an inferred table** (`NoProps`, `Writable`, and anything else
  the declaration names) must be exported from the package entry, or declaration emit fails
  TS2883. `packages/private-type-budget/test/declarationEmit.test.ts` imports them itself while
  `next/` is no export; drop that when they are.
- **A marker call nested inside another marker call's arguments gets no id** (a separate fix,
  its own spec). Until it lands, hoist `tableFromType<T>()` out of another marker call.

### What `next/` already has (pg)

- `drizzle-orm/next/`: `Column`, `NamedColumn`, `PropsOf`, `$type`, `tableRef()` /
  `TableRef`, lazy flag derivation and the models, `refineTableType` (keeps every column fact,
  key flags included), the `tableFromType` reader for the new reflected shape (`fromType.ts`),
  and `recordColumn` (`recorder.ts`), the runtime that splits a props object back into
  drizzle's config argument and the modifier calls, in the props' key order.
- `drizzle-orm-pg-core/next/`: all 33 pg builders plus `customType`, `pgTable`,
  `tableFromType`, `pgView` / `pgMaterializedView`, `pgEnum`, `foreignKey` over the new
  columns, and `toDrizzle` / `ToDrizzleTable` / `ToDrizzleView`, which give each drizzle column
  its db name from the table's names map.
- Tests: `drizzle-orm-pg-core/test/next/` (type pins, runtime parity with raw drizzle, runtype id
  convergence in both call shapes, reflection of builder tables on their own, shared runtype
  entries), the in-process fuzz (`tableEquality.fuzz.spec.ts`, surfaces 2 and 4), the resolver
  fuzz (`test/next/drizzleTypeSource.integration.spec.ts`), and the budget suites
  (`columnFormats.compile.test.ts`, `declarationEmit.test.ts`, `drizzleFreeAuthoring.test.ts`).
- mysql and sqlite (once the side-by-side work lands): the same files and tests in their own
  `next/` and `test/next/`, each with an in-process and a resolver fuzz, budget rows, and a mysql
  `SynthConfig` that reads `isPrimaryKey` / `isAutoincrement` / `hasRuntimeDefault` from the key
  flags for `$returningId()`.

## Plan

1. **Replace, not add, in all three dialects at once.** Move `next/` over `src/` in `drizzle-orm`
   and the three dialect packages,
   and delete what it replaces: `RtColumnBrand`, the key-flag brand types, `RtColType` /
   `RtTypedColumn`, `TypedCols`, the dialects' kind interfaces (`RtPg*Column`, `RtMy*Column`, `RtSqlite*Column`), `PgColMods` bags as
   builder chains, the shipped models and refine, and `ColDbNameOf` (the new `ToDrizzleTable`
   reads the names map). No compatibility shim (repo convention). Export every helper type an
   inferred table names.
2. **Readers.** The runtime reader becomes `next/fromType.ts`. The Go convert program
   (`ts-go-runtypes/internal/convert/drizzle.go`, `specFromGraph` and the sentinel constants)
   reads the new shape: one `@rtColSpecKey` member whose `config` holds config keys and
   modifiers together (split by `colModNames`), no `@rtColModsKey`, no `name` in the spec, db
   names from the table's `names` member, and `fn: 'enum'` / `'custom'` refused.
3. **`mion convert`.** builders to type becomes a near rename of the props object (no chain
   walk); type to builders prints one call per column. References print
   `[() => tableRef(x, 'id'), actions]`, and `TableRef<X, 'id'>` in a type; a self-reference
   keeps its `(): AnyRtColumn =>` style annotation, now `(): TableRef<'t', 'id'> =>`.
4. **`mion drizzle-migrate`** (`ts-go-runtypes/internal/drizzlemigrate/`) folds drizzle's
   chains into one call. The chain walker exists: convert's `columnFromChain`
   (`internal/convert/drizzle.go`, about lines 880-1007) already turns a chain into exactly this
   props object; reuse it, do not write a second one. A callback, a `sql` value or an
   interpolated template goes into the props as its argument tuple, unchanged.
5. **Gates that parse the source layout and will break**: `packages/drizzle-orm/test/modifierParity.ts`,
   `test/colMods.spec.ts`, each dialect's `test/manifest-coverage.spec.ts` and
   `test/completeness.spec.ts` (it diffs chain methods against drizzle's builder prototypes; it
   now diffs the props bag keys instead). Update `.claude/skills/drizzle-slim-schemas/`
   (SKILL.md and ARCHITECTURE.md) to the new sync points.
6. **Budgets.** `typeRoad`, `modelPipeline` and `laneComparison` move. Each increase is a
   reviewed exception commented where the budget lives. `columnFormats.compile.test.ts` loses
   its shipped columns (or keeps a frozen copy of them as the reference line, decide then).
7. **Model cost.** Before accepting the builder-road increase, try precomputing flags on the
   builder path only (the builder knows its props at the call), measured against today's
   builders; every earlier attempt is in `TYPE-COST.md`.

## Tests

- Everything under each dialect's `test/next/` moves to the package tests: type pins (builder column and table equal the hand-written ones, models
  equal the shipped models captured before the switch), runtime parity with raw drizzle, runtype
  id convergence in both `getRunTypeId` call shapes, reflection of builder tables on their own.
- Go: convert round trips on the new shape, drizzle-migrate chain folding (every modifier, a
  callback, a `sql` default, a self-reference), `go -C ts-go-runtypes test ./internal/... ./cmd/...`.
- **Convert and drizzle-migrate are tested in pg, mysql and sqlite alike.** Every case runs once per dialect from ONE
  dialect list (like the TS parity test's `DIALECTS` array); a case that fits only some dialects says so in its name
  (`only pg: enableRLS head refused`). Today these tests are almost all pg.
  - `ts-go-runtypes/internal/convert/drizzle_test.go`, per dialect: builders to type, type to builders, the round-trip
    fixpoint; named imports (round trip and runtime modifiers included); keyed-object and grouped-array extraConfig;
    refused heads (a table creator in all three, a schema in pg and mysql, enableRLS in pg); nested declarations and
    scope, derived pair names, the migrated recorder const name, the capitalised-const `T` suffix; forward (thunk),
    self and backward references; references with `sql`, table extras, runtime modifiers and their mismatch
    refusals, the CNV009 refusals, the no-type-twin refusals (enum, custom); `TestFuzz_DrizzleRoundTrip` with one
    generator per dialect vocabulary. Drop the stale comment at `drizzle_test.go:692-696` (sqlite `int` converts now).
  - `ts-go-runtypes/internal/drizzlemigrate/migrate_test.go`: stub `drizzle-orm/mysql-core` and
    `drizzle-orm/sqlite-core` beside pg; the split cases per dialect (table, table creator, schema in pg and mysql,
    a lazy index declared after its table, namespace import, `Used[<dialect>]`).
  - `drizzleConvert.integration.spec.ts` (the real `mion convert` CLI round trip) in each dialect package: mysql
    and sqlite need a 60s `testTimeout` / `hookTimeout`, `drizzle-mysql` and `drizzle-sqlite` move to the heavy
    projects in `packages/devtools/test/test-batch-contracts.test.ts`, and the file joins the TS parity test's
    file list.
- Both fuzzes for all three dialects, soaked (`MION_FUZZ_ITER=40`, several seeds).
- Stray-key pins in every dialect: the shipped column types accept `Varchar<'v', {length: 10; autoincrement: true}>`
  today (a weak-type check only rejects an object sharing no key); the `next/` ones reject it, and the switch must
  keep that for every builder and column type.
- The drizzle-e2e lane: drizzle's own suites translated by the new drizzle-migrate, for all five
  lanes.

## Tests the switch must carry to the new columns

The side-by-side PR made the three `next/` dialects mirror each other (a parity test, `packages/drizzle-orm/test/nextDialectParity.spec.ts`, fails on any test one dialect has and another lacks unless it is marked `only <dialects>:`). These checks exist today only for the shipped columns, often for pg only, and must move to the new columns in all three dialects when the shipped ones go:

- Builder completeness against drizzle (`drizzle-orm-pg-core/test/completeness.spec.ts`, and the column-only copies inside the mysql and sqlite `index.spec.ts`): retarget from chain methods to the props interfaces, so a drizzle upgrade that adds a modifier still fails; include entry builders, table own methods and view builders for every dialect.
- Validators compiled from the models: accepts a valid row, enforces captured and refined params (formats, ranges, integers, dates, enums), insert rejects a missing required column, patch is partial.
- extraConfig keyed-object form and grouped-array flattening.
- The extras tuple on the type road (TableEntry index / unique / check / foreignKey) and models ignoring it.
- `$` marker without its `options.runtime` callback, and a callback without its marker, both refused.
- A thunk in `options.tables` for a table declared later, and `toDrizzle` refusing a value that is neither table, handle nor options.
- pg row level security policies and roles, and `pgSequence`, on the new surface.
- Boundary pins: a drizzle row is plain data, rows flow into the models, insert and update take the models, a nominal `$type` brand survives.
- `RefinedTable` rejections on the type road (unknown key, wrong param, boolean / enum / family change).
- `nestedMarkerCalls.spec.ts` for every dialect.
- `packages/private-type-budget/test/typeRoad.compile.test.ts`, `modelPipeline.compile.test.ts` and `laneComparison.compile.test.ts` for every dialect, and the shipped drizzle-free source replaced by the next/ template.
- The rpc-client e2e (`packages/rpc-client/test/drizzleModels.e2e.spec.ts` via `packages/private-test-server/`) declares only a pg table.
- `packages/devtools/test/publish-order.test.ts` and `test-pr.test.ts` name only the pg package.
- Convert and migrate tests in all three dialects: see the convert bullet in **Tests** below.
- The shipped index entry types offer the dialect's index options before `.on()`, where drizzle only has them after: `index('idx').using('hash').on(col)` compiles on mysql and throws at `toDrizzle` (`entry[method] is not a function`). Give the new surface drizzle's two steps (`on` first, then the options) and pin the wrong order with `@ts-expect-error` in every dialect.
- The shipped `pgSchema(...).enum` object form keeps the object as `enumValues` instead of its values (`src/table.ts` `schemaEnum` skips the `Object.values` step top-level `pgEnum` does). `next/` works around it with `enumFromShipped`; the switch must drop the workaround and fix the recorder, with a test.
- Every new test file joins the parity test's file list; every new dialect joins its `DIALECTS` array.

## Docs

`container/website/content/01.rpc/04.drizzle-orm/`: every page showing a column changes to
the one-call spelling. `00.drizzle-overview.md` loses the "same names, parameters, modifier
chains" promise and gains the props rule; "Writing a Table as a Type" shows that a builder
table is the table type; `03.constraints.md` "Referencing Another Table" shows
`references: [() => tableRef(x, 'id')]` and `TableRef`; `07.migrate-an-existing-schema.md` shows the
folded output. Update `packages/private-examples/src/drizzle/`.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example this change touched, review its report against the code, and commit it as its own commit.

## Removing the old system, carefully

The old and new systems share names (`Varchar`, `Int`, `pgTable`, `toDrizzle`, `tableFromType`, `InferSelectModel`,
...), so a plain grep cannot tell them apart. Remove it this way:

1. **Plan the removal in writing before deleting anything**, and add the list to this spec:
   - every old-system file and symbol per package: the chain kinds (`RtPgColumn`, `RtMyIntColumn`,
     `RtSqliteColumn`, ...), `RtColType`, `ColNameArg`, `ColConfigArg`, `cols()`, the `@rtColModsKey` sentinel,
     the old graph reader in `src/fromType.ts`;
   - their Go twins in `ts-go-runtypes/internal/convert/drizzle.go` (sentinel constants, `columnFromChain`) and in
     `internal/drizzlemigrate/`;
   - every `next/` path that disappears once `next/` moves into `src/`.
2. **Remove, then let the tools find the breakage.** Move `next/` into `src/` and delete the old files outright,
   then run `pnpm run typecheck`, `pnpm run lint`, `go -C ts-go-runtypes vet ./...`, the Go tests and
   `pnpm miondevx core drizzle-translate --to-types`. Every broken import or unknown name is a leftover: the compiler
   resolves by module path, which grep cannot.
3. **Grep only with path-aware patterns**: import specifiers (`from '.*drizzle-orm/next`, `from '.*/next/`,
   `src/typeColumns`) and names only the old system has (`RtColumnBrand`, `ColNameArg`, `rtColModsKey`,
   `RtMy.*Column`). Never search a bare shared name like `Varchar` without its import path.
4. **Check what no compiler sees**: the `"next"` excludes in each `tsconfig.build.json`, the `next/` handling in
   `scripts/lib/drizzle-line.mjs`, the parity test's file paths (`test/next/...` becomes `test/...`), the
   "shipped vs new" lines of `packages/private-type-budget/test/columnFormats.compile.test.ts`, the "Side by side"
   section of `packages/drizzle-orm/TYPE-COST.md`, the manifests, the drizzle-slim-schemas skill,
   `packages/drizzle-orm*/CLAUDE.md`, the website drizzle pages and `packages/private-examples/src/drizzle/`.
5. **An independent leftovers pass.** Once the removal is green, a fresh subagent that did not do the removal gets
   the written list and the branch diff and searches the whole repo for anything of the old system still standing:
   code, Go, tests, scripts, docs, skills, comments that still describe chained modifiers, dead exports, unused
   files. It reports and never edits. Fix every item, then run the pass again until it finds nothing.

## Out of scope

- Pure-function callbacks in a table type: their own spec.
- Typed `extraConfig` entries on a builder table.

## Done when

- The three dialects run on the single-call system and the old column types are gone.
- drizzle-migrate folds chains; convert reads and writes the new shape.
- Convert and drizzle-migrate tests run for pg, mysql and sqlite from one dialect list; a dialect-only case is marked
  in its name.
- The old system is gone: the written removal list is ticked off, and an independent leftovers pass by a subagent
  found nothing on its last run.
- All tests above pass, the drizzle-e2e lane passes (labels `drizzle-e2e` and
  `pre-publish-e2e`), budgets moved only as reviewed exceptions.
- Docs updated.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every
  touched source file, each committed on its own.
