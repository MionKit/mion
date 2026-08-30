---
type: feature
spec: full-plan
status: done
created: 2026-08-29
completed: 2026-08-30
---

# Run the type road through the drizzle e2e lane

## What shipped

The lane runs THREE trees per dialect now, each against its own database, all
answering to the same control:

```
converted 68 table(s) with 20 refusal(s)
drizzle's own code: 183 passed
translated:         191 passed   same outcome on every vendored test
type road:          191 passed   same outcome on every vendored test
type errors: 0 before, 0 after on both roads
every migrated manifest entry with a type alias was exercised on the type road
==> [pg] both roads are green against a real database
```

All three dialects, against real databases:

```
pg      68 converted / 20 refusals   183 control -> 191 / 191 on both roads
mysql   68 converted / 29 refusals   177 + 1 fail -> 181 + 1 on both roads
sqlite  59 converted /  6 refusals   132 + 4 fail -> 137 + 4 on both roads
```

The failures are drizzle's own: better-sqlite3 rejects an async transaction
callback, and one mysql test reads migration files this lane does not vendor.
They fail identically on all three trees, which is the whole point of comparing
rather than counting.

Run on the default ESNext lib, no `lib` override. The lane carried a temporary
`lib: ['ES2023']` pin while the type road could not reflect Node's `Buffer`
there (MKR009); that fix landed separately and the pin came off, so sqlite's
`blob({mode: 'buffer'})` column now proves it against a real build.

Across all three dialects the host lane converts 191 tables with 52 refusals,
each naming the construct responsible, and the converted trees typecheck exactly
as drizzle's untranslated code does.

**Sixteen real defects, none of which any existing test caught.** Each is fixed
here with its own commit and its own test:

| Defect | Why it mattered |
| --- | --- |
| named imports refused to convert | every schema `drizzle-migrate` emits, and everything a real drizzle user writes, reported CNV009 |
| a table declared inside a function or test body was skipped SILENTLY | exit 0, no diagnostic; 95 of drizzle's 113 pg tables are declared that way |
| a forward `references` had no spelling | drizzle's own `references: () => cities.id` is lazy, so the target routinely sits further down the file; the tables option now takes a thunk |
| claiming a bare `Date` import redefined `Date` for the whole file | 13 type errors in drizzle's own suites, from a name the claim never checked was in use |
| a reference resolved to a same-named table in another scope | the top-level `cities` and the one inside a test body overwrote each other in a file-wide map |
| `$onUpdate: () => sql\`now()\`` was rejected | drizzle's own suites write it and the builders road always accepted it |
| `.array().array()` collapsed into one marker | the marker carrier merges by name, so a dimension was lost in silence; refused with that reason now |
| mysql `serial` was not auto-incrementing on the type road | `$returningId()` inferred `{}` where the builders road infers `{id: number}` |
| the keyed `extraConfig` object refused | drizzle takes both shapes, its suites write both, and the recorder already replayed either |
| a grouped `extraConfig` array refused | drizzle flattens one level and its mysql suite relies on it |
| sqlite `int` had no column type | 13 tables refused over an alias that was deliberately left builders-only |
| **a relative re-export in a PUBLISHED .d.ts was not followed** | the walker joined `./columns.ts` verbatim while the file beside it is `columns.d.ts`, so the module looked empty: 68 of 88 refusals in the container. Only an e2e against the packed tarballs could see this one |
| `tableFromType` handed a second caller the first one's table | two tests declaring the same table each with its own `$defaultFn` closure shared one, so the second inserted NULL where drizzle's own code inserted a key. A call WITH options builds a fresh table now, the way a builder call does |
| **the lane installed STALE tarballs** | it only repacked with `--pack`, so a fix made after the last pack was tested as its unfixed predecessor and the lane reported the old behaviour as fact. It rebuilds and repacks whenever a package changed now. Both of these were caught by the type road against mysql, the last dialect to run |
| two translations doubled a word in derived names | `drizzle-migrate` appends a `$<kind>` recorder marker and `convert` appended a `Table` word, so a migrated table surfaced as `UnsignedInts$tableTable`. The marker now drops a trailing spelling of its own kind (`usersTable` becomes `users$table`), and a type name is the const with its first letter uppercased, taking `T` then `T1`, `T2` on collision |
| the lane installed a stale RESOLVER too | the first staleness guard watched `packages/` only, while `pack.mjs` copies the resolver out of `dist-binaries/`, which no JS build regenerates. A Go fix reached the container only if someone remembered to build the binaries, and a stale resolver fails as a wrong translation rather than a build error. Found when the ES2023 pin came off and MKR009 came back from a binary that predated its fix |

Two more the lane surfaced in its own plumbing: `caRunArgs` died on a host whose
proxy CA is a directory of certs, and every refusal message now names the
construct responsible instead of reading like the declaration was not recognized.

Corrections to the plan, each forced by the work:

- **Step 0 shipped as a GATE, not a derivation.** Which exports declare a
  splittable handle is a judgement the manifests cannot make (an index splits so
  `.useIndex(idx)` can still reach drizzle's builder; a foreign key never needs
  to). Deriving it from names would change behaviour or need its own list. So the
  arm still writes the judgement down, but every migrated export must now land in
  a bucket and a drizzle upgrade that adds one fails `TestEveryMigratedExportIsClassified`
  instead of silently doing nothing. Columns are exempt because the manifest
  already says which exports build one, and the generator records what each export
  hands back so whoever classifies a new name can see it.
- **The lane pins `lib: ["ES2023"]`.** On the ESNext lib, reflecting a column
  whose data is Node's `Buffer` halts the build with MKR009 before a single table
  materializes. That is a real limit and it has its own todo
  (docs/todos/esnext-buffer-reflection-mkr009.md, delegated to a parallel
  session); it is not what this lane measures.
- **The addendum splits its builders-only constructs onto their own table.** An
  interpolated sql template and a column from a local customType have no type
  spelling, so a table carrying either refuses and every column type beside it
  loses its type-road coverage. pg and mysql each also gained a table for the
  column types drizzle only ever declares on an `all_types` table that cannot
  convert.

The plan below is what was built.

## Problem

The drizzle-e2e lane (docs/done/drizzle-translate-and-real-db-e2e.md, merged in PR #171) proves ONE
translation: drizzle's own suites onto the slim builders, run twice against a real database and
compared. The packages ship a SECOND translation, builders to the pure-type road
(`ts-runtypes convert --to type`, `DB.PgTable<'users', {...}>` + `DB.tableFromType<UsersTable>()`,
docs/done/drizzle-type-defined-tables.md), and nothing has ever run it against a database.

Its oracles today are all structural or synthetic:

- `typeTables.spec.ts` per dialect compares `getTableConfig` projections.
- `tableEquality.fuzz.spec.ts` interprets random specs over three surfaces, in process.
- `drizzleTypeSource.integration.spec.ts` renders synthetic type text through the real resolver.
- `drizzleConvert.integration.spec.ts` round trips the real CLI over a 6 line temp project.

No test inserts a row into a type-defined table, and no test puts a converted file through the
devtools build transform the marker form actually needs. Add a THIRD pass to the lane: convert the
translated tree to the type road, run the same suite against its own database, and demand the same
outcomes as the control.

## Measured on the current tree (2026-08-29), before any code is written

Two blockers, both measured by running the real binary over the real translated tree
(`pnpm rtx core drizzle-translate --keep`, then `bin/ts-runtypes convert --to type` over it).

**1. Named imports refuse.** All 18 top level pg tables report CNV009 and the run exits 1:

```
tests/pg/pg-common.ts: CNV009 error [usersTable$table]: drizzle table "usersTable$table":
  only namespace-qualified table calls convert (import * as DB from the dialect package)
tests/pg/pg-common.ts: CNV009 error [usersMySchemaTable$table]: drizzle table
  "usersMySchemaTable$table": a column must be a namespace-qualified builder call chain
```

The two refusals are `specFromBuildersAST` (ts-go-runtypes/internal/convert/drizzle.go:460) and
`columnFromChain` (drizzle.go:516); both printers spell every name as `spec.alias + "."`
(`printDrizzleType` drizzle.go:1202, `printDrizzleBuilders` drizzle.go:1351), and
`drizzleExports` (drizzle.go:1104) resolves the dialect module from the namespace identifier alone.
`drizzle-migrate` emits named imports, and so does essentially every real drizzle user, so the
type road is unreachable from a migrated schema today.

**2. Declarations inside blocks are invisible.** `recognizeFile` walks only the file's top level
statements (ts-go-runtypes/internal/convert/recognize.go:68). Drizzle's suites declare most of
their tables inside test bodies. Counted in the translated tree:

| file | top level recorder decls | inside test bodies |
| --- | --- | --- |
| `tests/pg/pg-common.ts` | 20 | 93 |
| `tests/mysql/mysql-common.ts` | 15 | 105 |
| `tests/sqlite/sqlite-common.ts` | 14 | 52 |

A nested declaration is skipped SILENTLY: exit 0, no diagnostic. Converting only the top level
would leave the third pass close to vacuous, and nothing would say so. Verified with a two table
fixture: the top level table converted, the one inside a function was left untouched with no
message.

Both are real user-facing gaps, not lane plumbing, which is exactly what the todo predicted:
this is the first time the feature meets real code.

## Plan

### 0. Vocabulary rule: derive it, never write a name list

The original rule (docs/done/drizzle-type-defined-tables.md) was that the translator carries no
hardcoded drizzle names: the vocabulary comes from the manifests, from the upperFirst naming rule,
or from the checker reading the real package exports. The convert arm still holds that line
(drizzle.go recognizes by the `rtColSpecKey` / `rtTableKey` sentinels and verifies type names
against the module's real exports). The drizzle-migrate arm broke it, and today carries three
hand-written name tables:

```go
// ts-go-runtypes/internal/drizzlemigrate/recognize.go:30
var declKinds = map[string]string{"pgTable": "table", "pgView": "view", "pgEnum": "enum", ...}
var tableCreators = map[string]bool{"pgTableCreator": true, ...}
var handleMethods = map[string]string{"table": "table", "view": "view", ...}
```

Two consequences for this todo:

- **Mandatory:** none of the new work adds a name list. Named-binding recognition resolves through
  the checker (`importedNameOf`) and the generated import map, the type-side vocabulary keeps
  coming from `typeAlias` in the manifests plus the export walker, and the coverage gate reads the
  manifests rather than naming builders.
- **In scope, and worth it:** replace those three tables with a generated field. The manifests
  already record `kind`, but only as `column | function`, too coarse to tell `pgTable` from
  `pgEnum`. `gen-drizzle-manifest` reads the return type through the checker already (that is how
  it records `modifiers` and `typeAlias`), so it can record the handle kind the same way, and
  drizzlemigrate reads it out of the embedded import map. Then a new drizzle builder, or a new
  dialect package, needs no Go edit. If this turns out to need more than the generator field plus
  the lookup swap, drop it and record the exception in the todo rather than growing the PR.

### 1. convert recognizes named bindings (Go)

Mirror what `drizzlemigrate` already did for the same problem: recognition is "the callee resolves
to a binding imported from the dialect module", via `importedNameOf`
(convert/recognize.go:244) plus the module's export walker, not "the callee is `NS.fn`".

- `specFromBuildersAST` / `columnFromChain` / `entryFromChainAST` accept BOTH a namespace member
  access and a plain identifier that resolves to a dialect import. Namespace form keeps working
  byte for byte (the existing fixtures are the regression gate).
- `drizzleExports` gains a named-binding entry point: resolve the module from the import
  declaration behind the binding instead of from a namespace identifier.
- `drizzleTableSpec.alias` stops being "the namespace name" and becomes a SPELLING strategy: either
  `DB.` prefixed, or bare names plus the import edits that bring them in. Both printers ask the
  strategy for a name (`spell("PgTable")`, `spell("tableFromType")`, `spell("Varchar")`), so the
  printed output keeps the file's own import style.
- The needed bindings (`PgTable`, `tableFromType`, `TableEntry`, every column type alias and
  modifier marker) are added to the existing import statement through `imports.go`'s
  `planImportEdits` / `appendImportEdit`, the same machinery `drizzlemigrate` uses. Collisions
  (drizzle's own `index`, `unique`, `sql` already bound in the file) go through the existing alias
  path, and the converse direction must drop bindings that stop being used.
- The builders direction gets the same treatment, so the round trip stays a fixpoint in a
  named-import file.

### 2. convert sees declarations inside blocks (Go)

`recognizeFile` walks nested statement lists as well as the top level. Scope is the change to get
right, not the walk:

- Recurse into block-bearing statements (function and arrow bodies, blocks, `describe` / `test`
  callbacks). Class and enum declarations stay excluded as they are today.
- Names are claimed per SCOPE, not per file. `nameTable.claim` (convert/names.go) currently claims
  file wide; drizzle's suites declare `const users` in twenty different test bodies, and the
  drizzle-migrate work already hit and solved this exact wall ("the recorder name is scoped, not
  claimed file wide"). Reuse that resolution.
- `buildDrizzleFileInfo` (drizzle.go:1535) keys `constByTableName` / `posByTableName` per file. A
  References target must resolve in the SAME scope or an enclosing one, and the "declared earlier"
  check becomes "declared earlier in an enclosing scope", so a table in another test body is never
  silently picked as a reference target. Where it cannot resolve, refuse as it does today.
- A skipped nested declaration must never be silent again: anything recognized as a drizzle table
  that the arm declines to convert reports a diagnostic.

### 3. `convert --report`, so refusals cannot grow quietly

Add `--report <file>` to the convert verb (cmd/ts-runtypes/convert_cli.go), the same shape
`drizzle-migrate --report` already writes: per file, the declarations converted (with the type
aliases and modifier markers they used) and every refusal with its code and reason. The lane's
gates read it; the developer reads it to see what the type road still cannot express.

### 4. The third pass in the lane

`container/drizzle-e2e/shared/run-suite.mjs` grows a third tree beside `WORK` and `CONTROL`:

```
CONTROL  drizzle's own code                     -> its own database
WORK     drizzle-migrate onto the slim builders -> its own database
TYPES    WORK + `convert --to type`             -> its own database   (new)
```

- Produced with `convert --to type --out-dir /drizzle-e2e/types --report /out/<dialect>-convert-report.json`
  from WORK AFTER the runner and addendum are copied in, so the addendum's builders convert too
  (it covers builders drizzle's suites never touch, so it carries their type aliases).
- Its own database, for the reason the control already has one (`useControlDatabase`): the suites
  drop and recreate the same tables, so a shared database makes the runs dependent. Add a third
  `types` database / third sqlite file.
- The verdict is the same comparison, against the SAME control: `assertSameOutcomesAsControl` is
  called a second time with the types results. Refusals are allowed and expected, a refused
  declaration stays valid builders code and the test still runs, so a refusal costs coverage, never
  correctness.
- Typecheck the types tree and diff it against the control exactly as the translated tree is
  (`typecheckAgainstControl`, generalized to take a tree).
- The summary JSON gains `typesSuiteFailed` / `typesTypecheckFailed` / `typesCoverageFailed`.

### 5. The devtools transform inside the container

`DB.tableFromType<UsersTable>()` is a MARKER call: `packages/drizzle-orm-pg-core/src/table.ts:115`
takes `id?: InjectRunTypeId<T>` and forwards it to `getRunType` from `@ts-runtypes/core`. Nothing
resolves it without the build transform, so the types tree needs a real consumer build, which no
lane has ever given the type road:

- Install `@ts-runtypes/devtools` and `@ts-runtypes/core` from the same in-container verdaccio,
  beside `@ts-runtypes/bin`, in run-suite step 1.
- A second vitest config for the types tree that loads the plugin, modelled on
  container/pre-publish-e2e/mion-consumer/vitest.config.ts (which does exactly this with the
  published tarballs). `@ts-runtypes/devtools/vite`, `tsConfig` pointed at the types tree's
  tsconfig, genDir inside the tree. Everything else (pool, fileParallelism, timeouts) stays as
  container/drizzle-e2e/shared/vitest.config.ts has it.
- This is the pass's real value beyond the database: it is the first time the marker to resolver to
  typeFn cache to `tableFromType` chain runs in a consumer-shaped build.
- SCALE CHECKPOINT, do this first and cheap: point the resolver at one translated common file
  (~6500 lines, ~110 table types) before wiring anything. If reflecting them is too slow or blows a
  type instantiation budget, that is a finding to fix, and it changes the shape of the pass. Do not
  discover it after the container work.

### 6. A coverage gate for the type road

`checkCoverage` in run-suite.mjs, second instance, keyed on the manifests' `typeAlias` field rather
than `fn` (every migrated entry already carries one, e.g. `varchar` to `Varchar`, gated by the
per-dialect manifest-coverage specs). Every migrated entry whose `typeAlias` exists must appear in
the types tree inside a test that actually PASSED, or be named in the convert report as a refusal
with a reason. The reason list is a measurement, not a hand-kept skip list: it comes out of the
report, and a refusal that has no entry in the report fails the gate.

### 7. The host half, for the dev loop

`scripts/core/drizzle-translate.mjs` gains `--to-types`: after translating, run `convert --to type`
over a copy and typecheck it against the control, same as it already does for the translated tree.
That is the few second loop for steps 1, 2 and 6; the container is only needed for the database and
the devtools build.

`pnpm rtx core drizzle-translate [--to-types]` in scripts/rt.mjs's usage line. The release lane
keeps one front door (`pnpm rtx release drizzle-e2e`), plus `--skip-types` for local iteration.

### 8. Runtime callbacks must survive the conversion, both ways

A type cannot hold a function, so the four runtime modifiers do not live in the table type: they ride
the bridge call's options object, and the type keeps only a marker flag.

```ts
// builders
const jobs = pgTable('jobs', {slug: varchar('slug').notNull().$defaultFn(() => 'slug-1')});

// types
type JobsTable = PgTable<'jobs', {slug: Varchar<'slug'> & NotNull & $DefaultFn}>;
const jobs = tableFromType<JobsTable>({runtime: {slug: {$defaultFn: () => 'slug-1'}}});
```

The machinery exists and is not in question: `$Default` / `$DefaultFn` / `$OnUpdate` / `$OnUpdateFn`
carry the flag (packages/drizzle-orm/src/typeColumns.ts:161), the bridge replays the callback and
validates that marker and callback match in BOTH directions
(packages/drizzle-orm/src/fromType.ts:159-225), `toDrizzle<T>(options?)` forwards the same options
(packages/drizzle-orm-pg-core/src/drizzle.ts:174), and convert moves the callback text verbatim each
way (`readRuntimeCallbackTexts` / `fillRuntimeCallbacks`, convert/drizzle.go:1417,1481; printed as
`runtime: {…}` at :1272). One namespace-form round trip is pinned in
drizzleConvert.integration.spec.ts:85.

What is missing is coverage of that path under the two spellings this todo adds. Requirements:

- The named-binding work (step 1) and the nested-scope work (step 2) carry the runtime-callback path
  with them, not just plain columns. `readRuntimeCallbackTexts` reads the paired const's options
  through `decl.AliasStmt`, so scoped pairing has to keep working.
- Reversible, and that is a hard bar: builders to types and types back to builders, landing on a byte
  fixpoint, in a named-import file and inside a function body.
- Go fixtures and the CLI round trip each get a runtime-callback case in both spellings.

The lane exercises this for real rather than only in fixtures, so a callback that did not survive the
conversion fails against the database and the outcome comparison catches it. Counted in the vendored
suites:

| dialect | `$default` | `$defaultFn` | `$onUpdate` | `$onUpdateFn` |
| --- | --- | --- | --- | --- |
| pg | 1 | 0 | 3 | 2 |
| mysql | 1 | 3 | 2 | 3 |
| sqlite | 1 | 0 | 3 | 2 |

### 9. Fix what the pass finds

The builders pass found ten real defects in shipped packages. Expect the type road to be worse, and
budget for it: each finding is fixed in this same PR, with its own commit and its own test, per
CLAUDE.md. Two are already predictable and worth watching for by name:

- `tableFromType` memoizes one slim table per runtype id
  (packages/drizzle-orm-pg-core/src/table.ts:102). Two structurally identical tables in different
  tests share ONE materialized drizzle table, where the builders road makes a fresh one each call.
  If drizzle's suites use table identity anywhere, that is a real behavioural difference and the
  outcome comparison will catch it.
- References ride the eager `tables` option, so a forward reference refuses with a reorder message
  (drizzle.go:1249ff). Drizzle's suites are not written to that constraint.

## Tests

- **Go**, `internal/convert/drizzle_test.go` + `testdata/`: golden fixtures for the named-import
  form in both directions (recognition, printing, import add/drop, alias collision with drizzle's
  own `index` / `unique` / `sql`), and for nested declarations (per scope naming, a reference
  resolved in an enclosing scope, a reference across sibling scopes refused). The existing
  namespace fixtures are the regression gate for the spelling strategy.
- **Go**, `TestFuzz_DrizzleRoundTrip`: the corpus renders named-import files too, so the byte
  fixpoint covers both spellings.
- **Go regression**, `internal/convert`'s whole suite, and `internal/drizzlemigrate`'s, stay green
  (`go -C ts-go-runtypes test ./internal/...`). The drizzlemigrate fixtures are the gate on the
  step 0 swap: the same inputs must produce the same output with the kinds coming from the
  generated map instead of `declKinds`.
- **JS**, the per-dialect manifest-coverage specs extend to the new generated field, so a drizzle
  builder that grows a handle kind cannot land without it (`pnpm rtx core drizzle-manifest --check`).
- **JS**, `packages/drizzle-orm-pg-core/src/drizzleConvert.integration.spec.ts`: a named-import
  case beside the namespace one, and a table declared inside a function body, both round tripping
  to a fixpoint, each carrying a runtime-callback column so `options.runtime` survives both
  directions (step 8).
- **JS**, one spec that runs a converted type-road table through the devtools transform and
  materializes it, so the marker path is pinned outside the container as well.
- **The lane itself** is the acceptance test, and stays out of `pnpm test`.
- Marker test coverage rule: any new marker-API test pairs both `getRunTypeId` call shapes
  (ts-go-runtypes/CLAUDE.md). The convert arm itself does not touch the marker API.

## Docs

- The `drizzle-migrate` / convert page under container/website/sites/mion/content/: the type road is
  reachable from a migrated schema, named imports included, and a table declared inside a function
  converts. Consumer language, no manifest or recorder internals.
- container/drizzle-e2e/README.md: three trees, not two, and what the third proves.
- CLAUDE.md's containers section, one line: the drizzle lanes also run the type road.
- SETUP.md if the lane grows a user-facing flag.
- `scripts/lib/env.mjs` REGISTRY rows for any new var (a `RT_DRIZZLE_*` internal for the types pass,
  the third connection string), and `.env.sample` only for user-settable ones.

## Fuzzing

Not a new fuzz lane. The oracles already exist and are better: drizzle's ~500 tests against a real
database, plus the existing three-surface `tableEquality.fuzz.spec.ts` and the
`drizzletypes` resolver lane. The corpus extension in Tests (named-import rendering) is the one
fuzz-side change.

## Out of scope

- Views, enums, schemas, sequences and policies on the type road. Convert's drizzle arm handles
  TABLES; the rest stays builders in the converted tree, which is fine, the comparison covers it.
- Constructs with no type spelling: interpolated `sql`, `$type`, non-literal arguments. They refuse,
  are reported, and stay builders.
- Widening drizzle-migrate itself. This todo converts ITS output.
- `gel` / `singlestore`, the cache suites, drizzle-kit.
- Adding the lane to the per-PR `ci.yml` run.

## Done when

`pnpm rtx release drizzle-e2e` runs three trees per dialect (control, translated, type road) against
three databases, and the type-road tree has the SAME per-test outcomes and the SAME type errors as
the control, on pg, mysql and sqlite. `convert --to type` handles named imports and declarations
inside blocks, with no silent skips, pinned by Go fixtures and the CLI round trip; runtime callbacks
round trip through `options.runtime` in both spellings and land on a byte fixpoint; every migrated
manifest entry with a `typeAlias` is either exercised by a passing type-road test or named as a
reported refusal; `internal/convert` and `internal/drizzlemigrate` are still green; no new hardcoded
drizzle name list exists and drizzlemigrate's three are gone (or the exception is recorded here with
its reason); and every defect the pass surfaced is fixed in the same PR with its own test.
