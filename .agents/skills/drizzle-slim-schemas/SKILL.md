---
name: drizzle-slim-schemas
description: Add or update the slim drizzle recorders and their e2e lanes from the drizzle manifests. Use when a manifest has pending entries, the manifest check fails, or a dialect or driver is added.
---

# drizzle-slim-schemas

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

The drizzle family is built on SLIM RECORDERS: [ARCHITECTURE.md](ARCHITECTURE.md)
in this folder records the full design and why. Tables are authored as drizzle
tables with drizzle's names and config, except that a column takes every setting
in ONE props object (`varchar('name', {length: 100, notNull: true})`) instead of a
modifier chain. Every function comes from OUR packages and records its call at
runtime instead of running drizzle; `toDrizzle()` (each dialect's `./drizzle`
subpath, the ONE module importing drizzle-orm) traverses the recorded graph and
replays it 1:1. A column type is ONE optional spec sentinel `{fn, config, data,
base}` with no db name and no methods, so a builder table IS its hand-written
table type; models derive the flags from the props lazily; drizzle-orm is an
OPTIONAL peer.

- `packages/drizzle-orm` (`@mionjs/drizzle-orm`) — the dialect-agnostic core:
  the column types (`src/types.ts`: `Column`, `ColMods`, the flag derivation;
  `src/columns.ts`: `colModNames`, `$type`), `recordColumn` (splits a builder's props into drizzle's config
  argument and its modifier calls), RtColumnRecorder, RtEntryRecorder
  (index/constraint chains), RtValueRecorder (enum/schema/sequence/role handles),
  the sql recorder, createRtTable/materializeRtTable, `tableRef`, flat
  InferSelectModel/InferInsertModel, refineTableType, the sql template. Consumers import ALL of
  this shared surface from @mionjs/drizzle-orm directly.
- `packages/drizzle-orm-<dialect>-core` — the dialect surface: `src/columns.ts`
  (column builders and their column types), `src/types.ts` (each builder's config,
  data type, `*ColMods` bag and props interface, and the shared table/view/entry types), `src/table.ts`
  (table factories/schema handles), `src/helpers.ts` (index, constraints,
  checks, enums, policies), `src/drizzle.ts` (toDrizzle + the synthesized
  drizzle table typing), `src/index.ts` (the package root module). A dialect index
  exports ONLY its own local surface — it never re-exports the core package or
  anything else that is not its own.

The committed manifests (one `manifests/*.manifest.json` per package, the root
drizzle-orm module included) are the source of truth for coverage: the Go
generator (`ts-go-runtypes/cmd/gen-drizzle-manifest`, driven by the hand-owned
`drizzle-dialects.json`) decides WHAT needs review; this skill decides HOW each
entry maps. `localExports` counts declarations in the package (relative
re-exports followed); re-exports from drizzle itself never count.

## The loop

1. `pnpm miondevx core drizzle-manifest` regenerates the manifests (statuses are
   preserved; new drizzle exports arrive `pending`; a migrated entry whose
   recorded params drifted is downgraded to `pending` with the old shape in
   `reason`).
2. `pnpm miondevx core drizzle-manifest --pending` prints the review queue.
3. Run the **boundary pass** (next section) over that queue and get the
   decisions confirmed BEFORE authoring anything.
4. For each pending entry apply the confirmed decision: author a recorder
   (below) and flip to `migrated`, or flip to `skipped` with one of the
   boundary pass's reasons verbatim.
5. `pnpm miondevx core drizzle-manifest` again (canonical formatting), then
   `pnpm miondevx core drizzle-manifest --check` until green. The per-package
   manifest-coverage specs and completeness specs must pass too.

## The boundary pass

Every pending entry is a decision about WHICH SIDE OF THE LINE a drizzle
feature lives on. Never take that decision on instinct: a feature the app reads
a type from, skipped by mistake, is not something a later regeneration will
ever flag.

**1. The rule.** Read it in [packages/drizzle-orm/AGENTS.md](../../../packages/drizzle-orm/AGENTS.md)
(the two questions, and the one exception for views built from a query
builder). Do not restate or reinterpret it here.

**2. The reasons.** A `skipped` entry carries EXACTLY ONE of these, verbatim.
Each names which question the entry failed, so the manifest stays readable as a
record of the boundary and not as free-text notes:

- `db/query layer: call drizzle on the toDrizzle() result` — drizzle-kit never
  reads it off the schema file, and no app type comes from it. Operators,
  aggregates, set operations, aliases, config readers, relations.
- `needs drizzle's select typing: declare with drizzle over toDrizzle() tables`
  — the query-builder-view exception, and the ONLY reason allowed to skip
  something drizzle-kit does read.
- `class or constant; passes through via export *` — generator-owned, never
  hand-written.

EVERY `column` entry must end `migrated` (there is no export-star to fall through to).

**3. Precedent, then ask.** For each pending entry, read the SIBLING dialects'
committed manifests and find what they decided for the same export, or for its
dialect-prefixed analogue (`mysqlView` ↔ `pgView` ↔ `sqliteView`). Present the
queue as a table — entry, proposed decision, reason, sibling precedent — and
confirm it with the available question tool before writing a single recorder.

The default answer is "same as the siblings", and for a new dialect that covers
nearly every entry. The pass exists for the handful with no precedent, which is
exactly where a wrong call is expensive.

## Authoring a column builder

In the dialect package, one block per column function:

1. **Config, data and bag** in `src/types.ts`: a local config interface mirroring
   drizzle's param shape (the manifest's `params` strings are the contract; the
   drift gate re-opens the entry when drizzle changes them; never import drizzle
   types), the data computation (`VarcharData<C>`), and the `*ColMods` bag of the
   modifiers this builder kind takes. Formats live in `@mionjs/run-types/formats`;
   pick per the drizzle column's VALUE semantics (length/width bounds, uuid, ip,
   date/time string shapes). A column with no matching format keeps its plain data
   type (boolean, string, unknown for json).
2. **Column type** in `src/columns.ts`: PascalCase of the function name (upperFirst,
   the manifest records it as `typeAlias`),
   `type Varchar<P extends Only<P, XConfig & XColMods> = NoProps> = Column<'varchar', P, VarcharData<P>>`.
   `Only` rejects a stray key; serial-likes pass their base flags as the 4th argument.
3. **Builder overloads**: the no-props forms first (`varchar()`, `varchar(name)`),
   then `(name, props)` and `(props)` with `const C extends Only<C, XConfig & XIn>`
   and the return `Built<'varchar', C, Data>` (wrapped in `NamedColumn<N, ...>` when
   named). The name overloads MUST come first: a plain name tried against the props
   overload is the expensive path (TYPE-COST.md).
4. **Implementation**: one line, `return dialectColumn('fnName', args)`, which calls
   `recordColumn`: the config keys go to drizzle's builder, the modifier keys replay
   as its method calls in key order.
5. Add the builder to the package's column-helpers record (the table factory's
   callback overload).

**Props interfaces** (`PgColIn`, `PgDateIn`, ...) group builders by drizzle's own
METHOD SETS (pg has four: common / +defaultNow / +defaultRandom / +identity; mysql
three; sqlite one). They are the builder's twin of the `*ColMods` bags, with the
function-carrying keys in their runtime shape (`references: [() => tableRef(...)]`,
`$defaultFn: [() => ...]`). A new drizzle modifier means: a key
in the core `ColMods` (`packages/drizzle-orm/src/types.ts`) and in `colModNames` (`src/columns.ts`)
AND in `drizzleModNames` (`ts-go-runtypes/internal/convert/drizzle.go`), a key in the
`*ColMods` bags and the props interfaces of the builders that have it (the `*SharedColMods`
base when both spell it alike), and its flag
in the derivation key lists (`NotNullKeys` / `DefaultKeys` / `ExcludedKeys`). The value
is `true` for a no-arg call and the args tuple otherwise. Four gates catch a
half-done job: `colMods.spec.ts`, `TestDrizzleModNamesMatchManifests`, each dialect's
`manifest-coverage.spec.ts`, and each dialect's `completeness.spec.ts`, which diffs
drizzle's builder methods against the props interfaces in both directions.

## Authoring an entry/value helper

Authoring `function` entries (index, uniqueIndex, unique, foreignKey,
primaryKey, check, policies, enums, schemas, sequences, table creators) wrap as:
- chainable table entries → `new RtEntryRecorder('fnName', args)` behind a
  typed entry interface (add any new chain method to RtEntryRecorder + the
  interface);
- standalone value handles → `RtValueRecorder` attached under `rtValueKey`
  (toDrizzle materializes them; pgEnum shows the factory-of-columns shape).

## Tests (paired, per package)

- **Raw drizzle is the oracle**: `test/typeTables.spec.ts` and `test/index.spec.ts`
  build the slim table and the same table with drizzle's own builders and keep
  `project(toDrizzle(slim))` equal to `project(raw)` (getTableConfig is the oracle).
- **Type pins** in `test/type-pins.stub.ts`: a builder table equals its hand-written
  twin; model rules for any new flag behavior.
- The shared test files hold the same titles in every dialect, checked by
  `packages/drizzle-orm/test/dialectParity.spec.ts`; a dialect-only test says so
  (`only pg, mysql: ...`).
- Validator specs run the models through `createValidateFn`; extend them when the
  new column carries a format. Any test touching the marker API follows the Marker
  test coverage rule (both `getRunTypeId` shapes).

## Adding a dialect, or a driver

Two different jobs. Tell them apart with ONE question: **does the drizzle module
export column builders?**

- **A dialect** (`drizzle-orm/<x>-core`) exports builders, so it needs a whole
  new `@mionjs/drizzle-orm-<x>-core` package. The checklist below.
- **A driver** (`drizzle-orm/d1`, `/durable-sqlite`, `/libsql`, `/neon-http`,
  `/better-sqlite3`) exports only a `drizzle()` factory, a session and a
  migrator. Tables for it are declared with its DIALECT's builders, which we
  already wrap. So a driver adds **no package, no `drizzle-dialects.json` row and
  no manifest work**. It needs type pins, an e2e lane, and docs, nothing else.
  Skip straight to "Both translate roads" and "Adding an e2e image".

### Step 0, not optional: the boundary pass over the whole new manifest

Run it BEFORE any package code exists. A new dialect arrives with every export
`pending` at once, which is the one moment the boundary gets set for that
dialect. The sibling decisions are the starting point, never the answer: work
the queue against the rule, and confirm it with the user.

### The touchpoints

Copy an existing dialect package and match it everywhere. Miss one of these and
the dialect looks finished while a gate or a lane silently skips it.

| Where | What |
| --- | --- |
| `packages/drizzle-orm-<d>-core/` | `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `vitest.config.ts`, thin `README.md`, a `AGENTS.md` carrying ONLY what is specific to this dialect |
| `src/` | `columns.ts`, `types.ts`, `table.ts`, `helpers.ts`, `views.ts`, `drizzle.ts`, `index.ts` |
| `test/` | `index.spec.ts` (the equality matrix), `type-pins.stub.ts`, `typeTables.spec.ts`, `valueHelpers.spec.ts`, `manifest-coverage.spec.ts` |
| repo root | a `drizzle-dialects.json` row, a `tsconfig.json` reference, the `lint:eslint` glob AND the lint-staged glob in `package.json`, the vitest project list |
| e2e | its own lane and image, per "Adding an e2e image" below |

`package.json` specifics that are easy to get wrong:

- `versionLine: "drizzle-orm"` — this is what puts the package on the drizzle
  version line instead of the lockstep train. Release membership is automatic
  from that marker; `pnpm miondevx release check-drizzle-versions` guards it.
- version aligned to drizzle's minor, not to the rest of the monorepo.
- three peers: `drizzle-orm` (optional, its own minor range), `@mionjs/run-types`
  (a RANGE, not a pin, so the consumer's single copy supplies both the format
  types and the runtime `getRunType`) and `@mionjs/drizzle-orm` (own minor range).
- `@mionjs/run-types` and `@mionjs/drizzle-orm` ALSO as `workspace:*`
  devDependencies, the one place per-package devDeps are allowed, so the package
  satisfies its own peers inside the workspace.
- the `./drizzle` subpath export, with a `source` condition like the root one.

Then regenerate (`pnpm miondevx core drizzle-manifest`) and get every gate green.

## Both translate roads are part of the dialect

A dialect is not done when its builders compile. It is done when drizzle code
**translates onto it**, and that translation **converts to the pure-type road**.
A new dialect supports every feature the older ones do, or it is half a dialect.

**Road 1 — `mion drizzle-migrate`, drizzle to mion.** It folds each column's
modifier chain into one props object and is driven by
`ts-go-runtypes/internal/drizzlemigrate/importmap.json`, generated by joining
`drizzle-dialects.json` with the per-package manifests. A `migrated` export moves
to the wrapping package under the same name; everything else stays on drizzle.
Never hand-edit that map — flip an entry's `status` in its manifest and
regenerate. `migrateAlias` (in the dialect's `drizzle-dialects.json` row) is its
only hand-owned input, for a name whose DRIZZLE spelling is still needed in the
same file; `sql` is the only one today.

**Road 2 — `mion convert --to type`, builders to pure types.** Needs, per
column: the `typeAlias` recorded in the manifest, a key in `ColMods` and the name
in `colModNames` (`packages/drizzle-orm/src/columns.ts`) AND in `drizzleModNames`
(`ts-go-runtypes/internal/convert/drizzle.go`), and its flag in the derivation key
lists. Gated by `colMods.spec.ts`, `TestDrizzleModNamesMatchManifests` and each
dialect's `manifest-coverage.spec.ts`.

**Run the host half first.** `pnpm miondevx core drizzle-translate [--to-types]` does
both translations and both typechecks with no container and no database. Get it
green before you touch an image; a translation bug found in a container costs ten
times what the same bug costs here.

A refusal class must never quietly grow: on the type road the coverage gate
excuses a miss only when the converter itself REPORTED the refusal.

## Adding an e2e image

The drizzle-e2e lane is the only thing in this repository that proves a
`toDrizzle()` table works against a real database rather than against another
type. Every other drizzle test compares a materialized table with a hand-written
drizzle one, which proves the structure matches and nothing more. So a new
dialect or driver is not shippable without a lane.

**The rule first: run drizzle's suite however drizzle runs it.** Our translation
happens at the drizzle TABLE level, so the test framework a suite happens to use
is not our concern, and a lane never rewrites a suite to fit a harness we prefer.
Vitest, a bare worker with a fetch handler, a plain script: run it as it comes.
The lane's only job is to capture a **comparable result** from each of the three
trees (control, builders, types) and compare them. What "comparable" means is
per-suite — a vitest JSON report, a response body, an exit code plus stdout — and
the lane writes down which artifact it compares and why.

The verdict is that comparison, never "the suite is green". Drizzle's own suites
are not green against every driver, and that is fine: what the lane asserts is
that the translation changed nothing.

Then the wiring, in order:

1. **The image.** `container/drizzle-e2e/<lane>/Containerfile` plus
   `_deps/package.json`. **Base image rule:** start from the DATABASE's own image
   when the suite needs a real server (`postgres:17-trixie`, `mysql:8.4`), and
   from plain `node:26-trixie` when it does not; add Node from the official
   tarball. Deps-only, like every image here: only `_deps/`, the shared workspace
   policy and the registry assets are baked, and everything in `shared/` is
   bind-mounted at run time so editing a runner never invalidates an install
   layer. Container deps are the one place a heavy dependency is fine — they
   never enter the workspace lockfile.
2. **Pin the suites.** Add each vendored file to `drizzle-suites.pin.json`, then
   `pnpm miondevx core drizzle-suites --record` on a trusted network and eyeball the
   diff. `tag` and `drizzleOrm` always move together. Nothing is fetched inside
   the container; the files are sha256-verified on the host and mounted read-only.
3. **The runner and the addendum.** `shared/runners/<lane>.test.ts` is ours, never
   vendored, and is copied into the translated tree AFTER the translation so it is
   not itself rewritten (it talks to drizzle directly). `shared/addendum/<lane>.test.ts`
   carries our own CRUD for the builders drizzle's suites never touch, so the
   coverage gate is satisfied honestly rather than waived.
4. **The lane spec.** `DIALECTS` in `container/drizzle-e2e/shared/run-suite.mjs`:
   which suite dir, which common file, which manifests to cross-check. A DRIVER
   lane rides an existing dialect, so its spec also names the package to install
   and does not claim manifests it does not own. Any gate a lane genuinely cannot
   carry is an explicit flag in its spec with a reason, never a silent skip.
5. **The front doors.** `DRIZZLE_DIALECTS` in `scripts/container/image.mjs` (it
   feeds both `TARGETS` and `targetSrcFiles`) and `DIALECTS` in
   `scripts/release/drizzle-e2e.mjs`. Two lanes may share one image; keep the
   image name a field rather than duplicating a Containerfile.
6. **Env vars.** Every new one goes in the `REGISTRY` array of
   `scripts/lib/env.mjs` with scope `internal`, and NEVER in `.env.sample`.
7. **CI.** A matrix entry in `.github/workflows/drizzle-e2e.yml`.
8. **Publish the image.** `pnpm miondevx container build-image drizzle-<lane>`, then
   `pnpm miondevx container push drizzle-<lane>`. **CI never builds these images**, it
   pulls them from GHCR, so a new lane stays red until a maintainer has pushed
   its image. Say so out loud when handing over a PR you could not push from.
9. **Document it.** Update the table and the image list in
   `container/drizzle-e2e/README.md`.

## Label the PR

The drizzle-e2e lane is expensive, so it does not run on every PR. It runs on a
PR into `prod` whose drizzle sources actually changed, or on **any PR carrying
the `drizzle-e2e` label**.

So a PR that touches `packages/drizzle-orm*`, `container/drizzle-e2e/`,
`drizzle-dialects.json` or `drizzle-suites.pin.json` MUST get the `drizzle-e2e`
label **when it is opened**, not after someone notices the lane never ran. Add it
with the GitHub MCP tools right after creating the PR.

Two things worth knowing:

- The label is added once. It survives new pushes, and `synchronize` re-runs the
  lane on every new commit while the label is on.
- If the change adds a NEW image, push it to GHCR before adding the label, or the
  lane fails on its pull step instead of telling you anything useful.
