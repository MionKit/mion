---
type: feature
spec: full-plan
status: done
created: 2026-08-29
completed: 2026-08-29
---

# Translate drizzle's own suites and run them against real databases

## What shipped

All three suites run green against real databases, which was the bar:

```
pg      190 passed
mysql   180 passed |  1 skipped
sqlite  137 passed |  4 skipped
```

No test is skipped, and the lane does not assert that the suite is green — it
asserts that the translation changed NOTHING. Every suite runs twice against the
same database, once translated and once on drizzle's own code, and the two
outcomes must match:

```
pg      drizzle 183 passed           | translated 190 passed
mysql   drizzle 177 passed, 1 failed | translated 180 passed, 1 failed
sqlite  drizzle 132 passed, 4 failed | translated 137 passed, 4 failed
```

The extra passes are this lane's addendum. The failures are drizzle's own against
these drivers (better-sqlite3 rejects an async transaction callback; the migrator
test reads files outside the subset this lane vendors), which is why they need no
list to excuse them: the control proves it every run.

The translated tree also typechecks against a reason-tagged baseline, and every
`migrated` manifest entry in all four manifests is exercised by a test that
actually passed.

The plan below is what was built, with the corrections the work forced. Four
things came out differently, and one thing came out much bigger.

**The lane found seven real defects in the shipped packages**, none of which any
existing test caught. That is the point of the todo, so they are fixed here, each
with its own commit and its own test:

| Defect | Why it mattered |
| --- | --- |
| `extraConfig`'s keyed-object form threw | drizzle still accepts it and its own suites use it 15 times; the recorder mapped the result as an array |
| a grouped `extraConfig` array was not flattened | drizzle flattens one level (`extraConfig.flat(1)`); ours handed the group through as a bare array of recorders |
| sqlite `integer('id').primaryKey()` was required on insert | it IS the rowid, so drizzle gives it a database default. The old belief was written into the type pins |
| generated columns were required on insert | drizzle's `HasGenerated` and `IsIdentity` both set hasDefault; without it `db.insert()` never typechecked on a table with one |
| `mysqlEnum` rejected a TS enum object | drizzle takes either a values array or the enum object |
| `toDrizzle(mysqlSchema(...))` answered `unknown` | nothing on the schema was usable |
| `toDrizzle(pgPolicy(...))` did not typecheck, and a real drizzle entry in extraConfig needed a cast | the runtime always handled both; only the types did not |

Corrections to the plan, each forced by the work:

- **Rule 3 reaches chained calls too.** The plan rewrote references only inside a
  recorder call's own arguments. `pgView(name, cols).as(sql`...`)` is a chained
  call, and our view builder takes our sql, so the rule had to cover it. It is
  expressed as a REGION (a split declaration's whole initializer) with a BARRIER
  (a call to a drizzle function that did not migrate), which is what keeps
  `eq(users.id, 1)` inside a view's sql pointing at drizzle's column while
  `foreignKey({foreignColumns: [users.id]})` in the same file points at ours.
- **A binding is decided by its USES, not by the map alone.** A migrated export
  used on both sides of the boundary is imported twice, and `sql` is only the
  most obvious case: a query-builder view the arm refuses needs drizzle's
  `pgView` in the same file as one it migrates. The map's `alias` field just
  pre-names the `sql` one for readability.
- **The recorder name is scoped, not claimed file-wide.** drizzle's suites
  declare `const users` in twenty different test bodies, and claiming
  `users$table` globally ran out of digit suffixes at the ninth.
- **The typecheck baseline is reason-tagged patterns, not a count.** A number
  cannot say why, and a new failure of a known shape has to stay visible. Four
  patterns are allowed today, each with its reason.
- **The lane skips by task name ANYWHERE**, not through drizzle's own
  `skipTests`. That one only skips inside its `common` describe, and mysql's
  index-hint tests are in their own.
- **An INDEX splits like a table.** The first cut skipped mysql's 16 index-hint
  tests, on the reasoning that `.useIndex(idx)` wants drizzle's own IndexBuilder
  while the table's extraConfig wants the recorder, and one binding cannot be
  both. That was true and the conclusion was wrong: the answer is the same split
  the tables already get. `toDrizzle` materializes a standalone entry (pg could
  already do it; mysql and sqlite were missing the branch), so the file gets
  `idx$index` for the table and `idx` for the hint. 16 skips and 15 baseline type
  errors went away with it.

One finding worth writing down rather than fixing: three `Expect<Equal<...>>`
assertions report our `date` column as `never`. It is NOT a defect in the
packages. The same 70-column table, verbatim, resolves `date` correctly in a file
of its own; the `never` appears only inside `pg-common.ts`, which is 6500 lines
declaring around a hundred slim tables. It is the checker giving up at a scale no
consumer schema file approaches. Covered by the baseline's format-brand pattern,
with that reason recorded there.

## Problem

Nothing proves a `toDrizzle()` table works against a real database, and there is no
migration path for a user with an existing drizzle schema file. Both are the same tool.

The existing specs compare `getTableConfig(toDrizzle(slim))` against a hand-written
drizzle build, so they prove the STRUCTURE matches. No test creates a table, inserts a
row or runs a query, and no package depends on a driver.

Drizzle's own `pg-common.ts` (182k), `mysql-common.ts` (159k) and `sqlite-common.ts`
(109k) are ~500 driver-agnostic tests it already trusts. Translate them to our packages
and run them, and the translation is proven by the same tests, against real databases.

Verified against drizzle-team/drizzle-orm at tag `0.45.2` (the tag is plain `0.45.2`, not
`drizzle-orm@0.45.2`) while writing this spec, so everything below is what is actually in
that tree.

## The shape already exists in this repo

`pnpm rtx core converted-suites` is the same lane: a codemod rewrites a whole suite tree
into another authoring form, vitest runs the generated tree against the SAME assertions,
then the tree is deleted. The trees are gitignored, the vitest config is standalone
(`--config`, never a root project), and the release-gate job is six lines. Follow it.
Two differences: the source tree is drizzle's, and it needs a database.

```
converted-suites:  our suites  --[ts-runtypes convert]---------> tree -> vitest
drizzle-e2e:       drizzle's   --[ts-runtypes drizzle-migrate]-> tree -> vitest + a real db
```

## The translation, in one picture

The original name keeps binding to the REAL drizzle table, so every test body works
untouched. A fresh `$table` binding holds the slim recorder.

```ts
// before (drizzle)
import {pgTable, uuid, varchar} from 'drizzle-orm/pg-core';
const users = pgTable('users', {id: uuid().primaryKey(), name: varchar({length: 50})});

// after (mion)
import {pgTable, uuid, varchar} from '@mionjs/drizzle-orm-pg-core';
import {toDrizzle} from '@mionjs/drizzle-orm-pg-core/drizzle';
const users$table = pgTable('users', {id: uuid().primaryKey(), name: varchar({length: 50})});
const users = toDrizzle(users$table);
```

`db.select().from(users)`, `getTableConfig(users)`, `eq(users.id, x)` and
`relations(users, ...)` all keep working with zero edits.

The suffix names the kind, so the recorder half reads as what it is: `$table`, `$view`,
`$enum`, `$schema`, `$sequence`, `$role`, `$policy`. Every one goes through
`nameTable.claim` ([names.go:161](../../ts-go-runtypes/internal/convert/names.go)) so it
can never collide with a name already in the file.

Only references that sit INSIDE a recorder call's arguments flip to the recorder binding,
because those must be recorded, not queried:

```ts
const posts$table = pgTable('posts', {authorId: uuid()}, (t) => [
  foreignKey({columns: [t.authorId], foreignColumns: [users$table.id]}), // inside the call
]);
const posts = toDrizzle(posts$table);
```

The same rule resolves the one name that lives on both sides. `sql` stays drizzle's; ours
comes in aliased and is used only inside recorder arguments:

```ts
import {sql} from 'drizzle-orm'; // query side, untouched
import {sql as rtSql} from '@mionjs/drizzle-orm'; // recorder side
const docs$table = pgTable('docs', {at: timestamp().default(rtSql`now()`)});
await db.execute(sql`select 1`);
```

Drizzle's common files put the whole boundary in one import statement, which is exactly
the case to handle. From `pg-common.ts`, `bigint` / `foreignKey` / `index` move while
`alias` / `except` / `getTableConfig` stay, out of the same statement:

```ts
import {alias, bigint, boolean, except, foreignKey, getTableConfig, index /* ... */} from 'drizzle-orm/pg-core';
```

## Plan

### 1. The import map is derived, never hand-written

[drizzle-dialects.json](../../drizzle-dialects.json) already maps drizzle module to mion
package. The four manifests already say, per export, which side of the boundary it is on,
and `gen-drizzle-manifest`'s `validate()` guarantees a `migrated` entry is exported from
our package under the SAME name. The map is a join, with zero new metadata:

| source                                    | rule                                                |
| ----------------------------------------- | --------------------------------------------------- |
| `drizzle-orm/<d>-core`, entry `migrated`  | to `@mionjs/drizzle-orm-<d>-core`, same name        |
| `drizzle-orm/<d>-core`, entry `skipped`   | stays put                                           |
| `drizzle-orm`, `sql` (`migrated`)         | to `@mionjs/drizzle-orm`, aliased `rtSql`           |
| `drizzle-orm`, everything else            | stays put                                           |
| (added)                                   | `toDrizzle` from `@mionjs/drizzle-orm-<d>-core/drizzle` |

Today that is 48 pg / 37 mysql / 17 sqlite / 1 root names moved, 450 left alone. Provider
helpers the suites use (`crudPolicy`, `authenticatedRole` from `drizzle-orm/neon`) are in
no manifest and stay put, as the boundary table says.

DO NOT add a `translate` field to the manifests. `status` already carries it, and a second
hand-owned field is a second place to get the boundary wrong. The one case status cannot
express is the query-builder view (`pgView('v').as(qb => ...)`), which is `migrated` but
must stay drizzle. That is decided by arity (2-arg call is ours, 1-arg is drizzle) and
recorded as a refusal.

### 2. The translator: a new arm on ts-go-runtypes, reusing convert

New `ts-go-runtypes/internal/drizzlemigrate/` plus
`ts-go-runtypes/cmd/ts-runtypes/drizzlemigrate_cli.go`, verb `ts-runtypes drizzle-migrate`.

The key simplification, and it is what makes this small: **this arm rewrites, it does not
re-print.** `convert` has to spell a table in the OTHER authoring form, which is why
[drizzle.go](../../ts-go-runtypes/internal/convert/drizzle.go) carries 1656 lines of
`specFromBuildersAST` / `columnFromChain` / `entriesFromExtraConfigAST` /
`printDrizzleType` / `printDrizzleBuilders`, and why it refuses (CNV009) whenever a
construct has no spelling. Here the table call text is kept BYTE-FOR-BYTE. The arm never
has to understand a column, a modifier chain or an extraConfig entry, so none of that
machinery is needed and refusals are rare by construction.

What it does need, and where it comes from:

| need                                                       | reuse                                                                                       |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| import inventory, named + namespace bindings, per module   | `imports.go` — `scanImports`, `importScan.localFor(module, imported)`, `moduleImport`, `namedBinding` |
| rewrite the import block, add/remove bindings, render      | `imports.go` — `planImportEdits`, `renderImport`, `appendImportEdit`, `identifierUsedOutside` |
| collision-safe new names (`users$table`)                   | `names.go` — `nameTable.claim`, `newNames`                                                  |
| splice edits into the source                               | `convert.go` — `replacement`, `applyReplacements`, `tokenStart`                             |
| diagnostics, per-file result, `--check`                    | `convert.go` — `Diagnostic`, `Severity`, `FileResult`, `Options`                            |
| CLI shell: files/dirs, `--out-dir` copy, `--tsconfig`      | `convert_cli.go` — `splitArgs`, `printUsage`, `expandConvertArgs`, `copyIntoOutDir`, `resolveEnrichProject` |
| exact binding resolution under shadowing                   | `recognize.go` — `importedNameOf(typeChecker, nameNode)`                                    |
| per-file const/name maps and the `sql` binding spelling    | `drizzle.go` — the `drizzleFileInfo` / `buildDrizzleFileInfo` pattern                       |
| refusal message style, `namespaceQualifier`, `referencesTarget` | `drizzle.go`                                                                           |

`applyReplacements` is a plain string splice, so multi-line replacements are fine. The
devtools `EditBuffer` is NOT an option here: it rejects multi-line replacement text by
design and is a byte-pinned Go/JS twin.

Two things must be GENERALIZED, not copied:

- `imports.go`'s managed-module set is four package-level vars pinned to
  `@ts-runtypes/core*` (`moduleCore`, `moduleBuilders`, `moduleFormats`, `moduleTemporal`).
  It becomes a table the caller supplies, so the same code serves both arms.
- `drizzle.go`'s recognizer only accepts NAMESPACE-QUALIFIED calls (`specFromBuildersAST`
  refuses otherwise: "import \* as DB from the dialect package"). Drizzle's tests use named
  imports, so recognition here is "the callee resolves to a binding imported from a mapped
  drizzle module", via `importedNameOf` plus the manifest allow-list. Namespace form keeps
  working.

It IS checker-based, like `convert`, but the checker resolves DRIZZLE's symbols, not ours,
which is fine because the input imports `drizzle-orm` and drizzle is installed. What
cannot be reused is the sentinel recognizer (`typeHasSentinel`), which looks for mion's
`rtTableKey` / `rtColSpecKey` on resolved types; the input has no mion types yet.

Rules, in order:

1. Split each `drizzle-orm*` import statement by the map above.
2. Split every declaration whose initializer head is a migrated authoring call, including
   inside test bodies, and the `pgSchema(...).table(...)` and `pgTableCreator(...)` forms:
   the recorder takes `X$<kind>`, the original name takes `toDrizzle(X$<kind>)`.
3. Inside a recorder REGION (a split declaration's whole initializer, plus a table
   factory's and a lazily-referenced helper's), rewrite references to split declarations
   to their recorder binding, and `sql` to `rtSql`. A BARRIER stops it: a call to a
   drizzle function that did not migrate, whose arguments must stay drizzle's.
4. Chained modifiers (`.enableRLS()`, `.$type<T>()`, `.array()`) stay on the recorder half.
5. Refuse and report, never guess: query-builder views, and any declaration whose head the
   arm cannot identify. A refused file stays valid drizzle, so the suite still runs and the
   skip list can name the test. New `DRZ###` codes alongside the `CNV###` ones.

`--report <file>` emits JSON: per file, which manifest entries were actually rewritten,
plus every refusal with its reason. That feeds both the skip list and the coverage gate.

SHIPPED AS: the import map is generated by the SAME run as the manifests
(`pnpm rtx core drizzle-manifest`) into `internal/drizzlemigrate/importmap.json` and
embedded with go:embed, so the shipped binary carries it and `--check` gates its drift.

`$type<T>()` is a no-op recorder in our packages (type-only in drizzle too), so the
materialized table is identical and the runtime tests are unaffected. One line in the
report so it is not mistaken for a bug.

The Marker test coverage rule does NOT apply: this arm never touches `getRunTypeId` or
`InjectRunTypeId`.

### 3. Vendoring: pinned, verified, gitignored

New `scripts/drizzle/fetch-suites.mjs`, modelled on
[scripts/lib/fetch-uws.mjs](../../scripts/lib/fetch-uws.mjs). What to fetch at tag
`0.45.2`, confirmed present:

```
integration-tests/tests/common.ts             # skipTests()
integration-tests/tests/utils.ts              # randomString() and friends
integration-tests/tests/pg/pg-common.ts
integration-tests/tests/mysql/mysql-common.ts
integration-tests/tests/sqlite/sqlite-common.ts
```

- `drizzle-suites.pin.json` at the repo root, beside `drizzle-dialects.json`: the tag, the
  drizzle-orm version it belongs to, and a per-file sha256 map. Verify EVERY file's sha256
  before use. GitHub's generated tarball is not byte-stable across their tooling changes,
  the files are.
- Cache at `.cache/drizzle-suites/<tag>/`, gitignored, next to `/.cache/rt-wasm/`.
- `--record` re-downloads at a new tag and rewrites the checksums, exactly like fetch-uws's
  trust-on-first-use.
- A check asserts `pin.drizzleOrm === installedDrizzleVersion(repoRoot)`
  ([drizzle-line.mjs](../../scripts/lib/drizzle-line.mjs)), so the suites can never drift
  from the packages.
- The `~/` path alias the common files use (`import {skipTests} from '~/common'`) maps to
  the vendored `tests/` dir in the lane's tsconfig.
- Keep drizzle's Apache-2.0 notice with the extracted tree. Nothing vendored is committed,
  so `packages/**` stays clear of the oxfmt glob and `.oxfmtrc.json`'s `ignorePatterns`
  stays empty.

Re-vendoring on a drizzle bump is a pin bump plus `--record`, never manual work.

WE WRITE OUR OWN RUNNER FILES. Drizzle's runners (`node-postgres.test.ts`,
`mysql.test.ts`, `better-sqlite.test.ts`) also carry top-level migrator tests that
`skipTests` cannot reach (it only skips inside the `common` describe), and pull in the
cache suites. Ours are ~40 lines each: open the client from the env var, call
`skipTests([...])`, call `tests()`. They live in `shared/runners/<dialect>.test.ts`.

### 4. Three containers, one per dialect

NO DOCKER-IN-DOCKER. `pg-common.ts` ships a `createDockerDB()` helper, but every runner
prefers an env var when it is set, so pointing at the container's own server bypasses it
entirely:

| dialect | env var                    | server                                |
| ------- | -------------------------- | ------------------------------------- |
| pg      | `PG_CONNECTION_STRING`     | postgres in the image                 |
| mysql   | `MYSQL_CONNECTION_STRING`  | mysql in the image                    |
| sqlite  | `SQLITE_DB_PATH`           | none, a file (defaults to `:memory:`) |

`pg-common.ts` still imports `dockerode` at the top level even when unused, so `dockerode`
goes in the pg `_deps` as a load-bearing no-op (or the fetch step drops the import).

```
container/drizzle-e2e/
  shared/
    registry/          verdaccio.yaml + serve script (drizzle-family tarballs only)
    runners/           our thin per-dialect .test.ts
    run-suite.mjs      fetch -> translate -> install -> vitest -> report
    skip-list.json     per dialect: test name -> reason
    addendum/          our own CRUD tests for builders the suites never touch
    _deps-common/      vitest, typescript, drizzle-orm (exact = installed version)
  pg/      Containerfile + _deps/   # + postgres server, `pg`, `dockerode`
  mysql/   Containerfile + _deps/   # + mysql server, `mysql2`
  sqlite/  Containerfile + _deps/   # + better-sqlite3, no server
```

Base `node:26-trixie` (mion-bench's choice, not bookworm). Each image bakes verdaccio and
its own `_deps` isolated pnpm project, so the drivers never touch the workspace lockfile.
`shared/` is staged into each build context by a `prepareContext` branch in
[image.mjs](../../scripts/container/image.mjs), the same trick `prepareBenchDeps` already
uses. The sqlite image is much lighter than the other two, which is the payoff for three
images over one.

Registration, three rows each:

- `TARGETS` in `image.mjs` gets `drizzle-pg` / `drizzle-mysql` / `drizzle-sqlite`, repos
  `mion-drizzle-pg` / `-mysql` / `-sqlite`.
- `DIRS_BY_TARGET` in `targetSrcFiles` so the deps stamp covers `_deps/` and `shared/`.
- Each Containerfile stages `.cacerts/` before any network step and ends with the
  `ARG DEPS_HASH` / `LABEL org.mionkit.deps-hash` pair as its last layer.

Every lane, every time, inside its container:

1. Start verdaccio, publish the packed tarballs (`ts-runtypes-binary-*`, `-bin-*`,
   `-core-*`, `-devtools-*`, `mionjs-drizzle-*`), touch `/tmp/registry-ready`.
2. `npm install @ts-runtypes/bin@$V @mionjs/drizzle-orm@$V @mionjs/drizzle-orm-<d>-core@$V --registry http://127.0.0.1:4873`.
   THIS IS HOW THE GO BINARY GETS INTO THE CONTAINER: `@ts-runtypes/bin` pulls the linux
   `@ts-runtypes/binary-*` optional dep, so the lane runs the translator that actually
   ships. No Go toolchain in the image.
3. Fetch and verify the pinned suites.
4. `ts-runtypes drizzle-migrate --out-dir /work/translated --report /work/report.json`.
5. Start the database, export its connection env var, run vitest over the translated tree.
6. Assert coverage (below), write the report out.

### 5. Wiring

- `scripts/release/drizzle-e2e.mjs`, the one front door, mirroring
  [scripts/release/e2e.mjs](../../scripts/release/e2e.mjs): `ensureTarballs`,
  `requireEngine`, and `startRegistry` / `waitHealthy` / `stopRegistry` from `image.mjs`.
  Flags `--dialect pg|mysql|sqlite|all`, `--pack`.
- `rtx`, three rows, no new area:
  - `release drizzle-e2e` runs the lane (a map row in `runRelease`, `scripts/rt.mjs`)
  - `core drizzle-translate` translates only, beside `drizzle-manifest`
  - `core drizzle-suites [--record]` fetches and verifies only, beside `ensure-tsgolint`
- New workflow `.github/workflows/drizzle-e2e.yml`, matrix over the three dialects,
  `fail-fast: false`, `permissions: {contents: read, packages: read}`:
  - `pull_request: branches: [prod]`, gated on the drizzle packages' published sources
    having changed since their last bump, reusing `unreleasedChanges()` from
    `drizzle-line.mjs`. Needs `fetch-depth: 0`; `{known: false}` means "cannot tell" and
    must RUN the lane, never skip it.
  - `pull_request: types: [labeled, synchronize, reopened]` plus
    `if: contains(github.event.pull_request.labels.*.name, 'drizzle-e2e')`, so any PR on
    any branch can run it on demand when someone touches the packages. This is a NEW
    pattern for this repo; no workflow uses labels today.
  - It packs its own tarballs. It cannot `needs:` a job inside the called
    `release-gate.yml`, and it must not live inside that gate, because the gate also runs
    on the publish path.
- [scripts/lib/env.mjs](../../scripts/lib/env.mjs) REGISTRY rows for every new var
  (`RT_DRIZZLE_*`, following `RT_E2E_*`, plus the three drizzle-owned connection vars);
  `internal` ones stay out of `.env.sample`.
- Credentials are already in place locally: `.env` carries `GHCR_PAT`, `GHCR_OWNER`,
  `GHCR_USER` and `GHCR_REGISTRY`, so `pnpm rtx container build-image drizzle-pg` and
  `pnpm rtx container push` work from the host with no extra setup. The three new images
  are private like `tsrt-e2e`, so CI pulls them via `./.github/actions/pull-shared-image`
  with `secrets.GHCR_PAT` (the repo `GITHUB_TOKEN` is denied) and the workflow needs
  `secrets: inherit`. A bare `pnpm rtx container push` now pushes all six.

### 6. The control, not a skip list

SHIPPED DIFFERENTLY. The plan below described a hand-written skip list. It was
built, grew to 21 entries, and was then deleted: a list of names cannot tell a
test drizzle itself fails from one the translation broke, which is the only
distinction that matters. The lane runs each suite TWICE against the same
database — translated, and on drizzle's own code — and requires the outcomes to
match. No list, no judgement, and the claim is measured every run.

The plan's own text follows, for the record.

### 6. (as planned) The skip list is written down, with reasons

`container/drizzle-e2e/shared/skip-list.json`, one array of test names per dialect, passed
straight into drizzle's own `skipTests(names)` (`tests/common.ts`, which skips by task name
inside the `common` describe). Every entry carries a reason. Expected shape:

- views built from a query builder: boundary exception, declared with drizzle by design
- migrator internals and driver-init tests: not our surface, and outside `common` anyway,
  which is why we write our own runners
- relations v2 (`createMany` / `createOne`): query layer, `skipped` in the root manifest
- cache suites (`*-common-cache.ts`): not vendored, the cache layer is not our surface

A failing translated test that is not on this list is a real recorder bug.

## Tests

- **Go**, `internal/drizzlemigrate/*_test.go`: golden fixtures under `testdata/` (outside
  the gofmt scope), one per rule. Import split, declaration split, in-recorder reference
  rewrite, the `sql` / `rtSql` split, schema and tableCreator forms, shadowed locals, and
  each refusal path with its `DRZ###` code. Run by `go -C ts-go-runtypes test ./internal/...`.
- **Go regression**, `internal/convert`: its existing suite must stay green through the
  `imports.go` generalization. That is the risk in this change, the two arms share the
  import manager.
- **JS**: a spec rebuilding the import map from `drizzle-dialects.json` and the four
  manifests, pinned against the boundary table in
  [packages/drizzle-orm/CLAUDE.md](../../packages/drizzle-orm/CLAUDE.md), so a manifest
  edit cannot silently change what the translator moves. Same precedent as
  `packages/ts-runtypes-devtools/test/drizzle-version-line.test.ts` reading
  `scripts/lib/drizzle-line.mjs`.
- **Coverage gate**, in-lane: cross the translation report against the manifests and fail
  if any `migrated` entry for that dialect was never exercised by an executed test. What
  the vendored suites miss gets a small CRUD test in `shared/addendum/<dialect>.test.ts`,
  until every migrated column builder has hit a real database.
- **The lane itself** is the acceptance test. It does NOT join `pnpm test`: no vitest
  project entry, a standalone config loaded by `--config`, exactly like
  `packages/ts-runtypes/vitest.converted.config.ts` and the fuzz lanes.

## Docs

- One page under [container/website/sites/mion/content/](../../container/website/sites/mion/content/)
  for `ts-runtypes drizzle-migrate`: what it rewrites, the `$table` split, what it reports
  instead of translating. Consumer language only, no manifest or recorder internals.
- [SETUP.md](../../SETUP.md), Containerized apps: the three new images and
  `pnpm rtx release drizzle-e2e`.
- [CLAUDE.md](../../CLAUDE.md): the Containers section (three images become six) and the
  drizzle package list.
- `packages/drizzle-orm/CLAUDE.md` gains one line pointing at the migrate verb. The
  boundary rule itself is not restated.

## Fuzzing

Not a fuzz candidate. The oracle already exists and is better: ~500 upstream tests against
a real database. The structural half is already covered by `tableEquality.fuzz.spec.ts`.

## Out of scope

- Publishing the translator as a separate consumer package. The verb ships on the existing
  `ts-runtypes` binary, which is enough.
- `gel` and `singlestore` dialects, the cache suites, and drizzle-kit `push` / `migrate`.
- Translating views built from a query builder. Reported, never rewritten.
- Adding the lane to the per-PR `ci.yml` run.

## Done when

The pg, mysql and sqlite suites, fetched at the pinned tag and translated by
`ts-runtypes drizzle-migrate`, run green against real databases in their three containers,
driven by `pnpm rtx release drizzle-e2e` locally and by `drizzle-e2e.yml` on both triggers.
`internal/convert`'s own suite is still green after the shared-code generalization, the
translation changes no test's outcome against drizzle's own code, and every `migrated` manifest entry
across the four manifests is exercised by at least one executed test against a real
database.
