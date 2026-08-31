---
name: drizzle-slim-schemas
description: Author or update the slim drizzle recorders of @mionjs/drizzle-orm and the @mionjs/drizzle-orm-<dialect>-core packages from the committed drizzle manifests. Use whenever any packages/drizzle-orm*/manifests/*.manifest.json has pending entries, when `pnpm rtx core drizzle-manifest --check` fails (new drizzle exports, drifted param shapes, migrated entries missing from a package), when a dialect completeness spec reports a drizzle builder grew a modifier, after a drizzle-orm version bump, when adding a new dialect package, when adding support for a new drizzle DRIVER (d1, durable-sqlite, libsql, neon), when adding or changing a drizzle-e2e container lane or its GHCR image, or when adding/changing a column builder or authoring helper in a package's src. Drives the whole loop, regenerate the manifests, map each pending entry to a slim recorder with a named data type (or skip it with a reason), add the paired tests, flip the status, get the check green, prove BOTH translate roads (drizzle-migrate and convert --to type), add the e2e lane that runs drizzle's own suites against a real database, and label the PR so that lane actually runs.
---

# drizzle-slim-schemas

The drizzle family is built on SLIM RECORDERS — [ARCHITECTURE.md](ARCHITECTURE.md)
in this folder records the full design and why. Tables are authored exactly as
drizzle tables, but
every function comes from OUR packages and records its call at runtime instead
of running drizzle; `toDrizzle()` (each dialect's `./drizzle` subpath, the ONE
module importing drizzle-orm) traverses the recorded graph and replays it 1:1.
Column types carry ONLY the runtype-format data type plus three booleans
(notNull / hasDefault / insertExcluded); models derive flat; drizzle-orm is an
OPTIONAL peer.

- `packages/drizzle-orm` (`@mionjs/drizzle-orm`) — the dialect-agnostic core:
  RtColumnRecorder (the modifier chain), RtEntryRecorder (index/constraint
  chains), RtValueRecorder (enum/schema/sequence/role handles), the sql
  recorder, createRtTable/materializeRtTable, flat InferSelectModel/InferInsertModel/
  InferUpdateModel, refineTableType, the sql template. Consumers import ALL of
  this shared surface from @mionjs/drizzle-orm directly.
- `packages/drizzle-orm-<dialect>-core` — the dialect surface: `src/columns.ts`
  (column builders + NAMED data types + the kind interfaces), `src/table.ts`
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

1. `pnpm rtx core drizzle-manifest` regenerates the manifests (statuses are
   preserved; new drizzle exports arrive `pending`; a migrated entry whose
   recorded params drifted is downgraded to `pending` with the old shape in
   `reason`).
2. `pnpm rtx core drizzle-manifest --pending` prints the review queue.
3. Run the **boundary pass** (next section) over that queue and get the
   decisions confirmed BEFORE authoring anything.
4. For each pending entry apply the confirmed decision: author a recorder
   (below) and flip to `migrated`, or flip to `skipped` with one of the
   boundary pass's reasons verbatim.
5. `pnpm rtx core drizzle-manifest` again (canonical formatting), then
   `pnpm rtx core drizzle-manifest --check` until green. The per-package
   manifest-coverage specs and completeness specs must pass too.

## The boundary pass

Every pending entry is a decision about WHICH SIDE OF THE LINE a drizzle
feature lives on. Never take that decision on instinct: a feature the app reads
a type from, skipped by mistake, is not something a later regeneration will
ever flag.

**1. The rule.** Read it in [packages/drizzle-orm/CLAUDE.md](../../../packages/drizzle-orm/CLAUDE.md)
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

EVERY `column` entry must end `migrated` — passthrough columns no longer exist
(there is no export-star to fall through to).

**3. Precedent, then ask.** For each pending entry, read the SIBLING dialects'
committed manifests and find what they decided for the same export, or for its
dialect-prefixed analogue (`mysqlView` ↔ `pgView` ↔ `sqliteView`). Present the
queue as a table — entry, proposed decision, reason, sibling precedent — and
confirm it with **AskUserQuestion** before writing a single recorder.

The default answer is "same as the siblings", and for a new dialect that covers
nearly every entry. The pass exists for the handful with no precedent, which is
exactly where a wrong call is expensive.

## Authoring a column builder

In `src/columns.ts` of the dialect package, one block per column function:

1. **Column type first** (the pure-types vocabulary): PascalCase of the
   function name (upperFirst — the manifest records it as `typeAlias`), an
   `RtColType<'fn', Name, Props, Data>` alias whose params mirror the builder
   arguments one to one (`Varchar<'bio', {length: 500}>` matches
   `varchar('bio', {length: 500})`; serial-likes pass the base flag union
   `'notNull' | 'hasDefault'`). `Props` is ONE object carrying the builder's
   own config keys AND its modifier calls, so the alias is written
   `<A extends string | (XConfig & XColMods) | undefined, C extends XConfig & XColMods>`
   and passes `ColNameArg<A>, ColConfigArg<A, C>` down. RtColType expands
   STRAIGHT to the branded column the builders return, so nothing normalizes an
   authored record afterwards.
   The Data computation is a SHARED helper the builder overloads also return
   (`VarcharDataOf<T, L>` cheap-params form for the builders, `VarcharData<C>`
   config-extract form for the type — the split keeps the type-instantiation
   budgets green). Formats live in `@mionjs/run-types/formats`; pick per the
   drizzle column's VALUE semantics (length/width bounds, uuid, ip, date/time
   string shapes). A column with no matching format keeps its plain data type
   (boolean, string, unknown for json).
2. **Local config interface** mirroring drizzle's param shape (the manifest's
   `params` strings are the contract; the drift gate re-opens the entry when
   drizzle changes them). Never import drizzle types.
3. **Overloads**: mirror drizzle's call shapes exactly (no-arg / config /
   name+config), returning the matching KIND interface with the initial flags
   (`false,false,false`; serial-likes start `true,true,false`).
4. **Implementation**: one line, `return dialectColumn('fnName', args)` — the
   recorder's init forwards the raw args to drizzle's same-named builder at
   materialization.
5. Add the builder to the package's column-helpers record (the table factory's
   callback overload).

**Kind interfaces** group builders by drizzle's own METHOD SETS (pg has four:
common / +defaultNow / +defaultRandom / +identity; mysql three; sqlite one).
A new drizzle modifier means: add the runtime recorder method in
`packages/drizzle-orm/src/recorder.ts` (a pure `record(name, args)`), declare
it on the affected kind interfaces with the right flag transitions
(`default`-like methods set HasDefault, `primaryKey`/identity set NotNull,
`generatedAlwaysAs` sets InsertExcluded), and add it to the completeness
spec's SLIM method list — that spec diffs drizzle's builder prototypes and is
what caught the modifier in the first place. The manifest records each
column's chainable methods under `modifiers`; a new one also needs, for the type
road: a key in `ColMods` (`packages/drizzle-orm/src/typeColumns.ts`), its name in
`colModNames` there AND in `drizzleModNames`
(`ts-go-runtypes/internal/convert/drizzle.go`), a key in the `*ColMods` bags of
the dialects whose builders have it, and the same flag transitions in
`ModNotNull`/`ModHasDefault`/`ModInsertExcluded`. The value is `true` for a
no-arg call and the args tuple otherwise. Three gates catch a half-done job:
`colMods.spec.ts`, `TestDrizzleModNamesMatchManifests`, and each dialect's
`manifest-coverage.spec.ts`.

## Authoring an entry/value helper

Authoring `function` entries (index, uniqueIndex, unique, foreignKey,
primaryKey, check, policies, enums, schemas, sequences, table creators) wrap as:
- chainable table entries → `new RtEntryRecorder('fnName', args)` behind a
  typed entry interface (add any new chain method to RtEntryRecorder + the
  interface);
- standalone value handles → `RtValueRecorder` attached under `rtValueKey`
  (toDrizzle materializes them; pgEnum shows the factory-of-columns shape).

## Tests (paired, per package)

- The **equality matrix** in `src/index.spec.ts`: extend the slim and raw
  tables with the new column/modifier/helper and keep
  `project(toDrizzle(slim))` equal to `project(rawDrizzle)` (getTableConfig is
  the oracle).
- **Type pins** in `src/type-pins.stub.ts`: builder-inferred data equals the
  named type; model rules for any new flag behavior.
- Validator specs already run the models through `createValidateFn`; extend
  them when the new column carries a format. Any test touching the marker API
  follows the Marker test coverage rule (both `getRunTypeId` shapes).

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
| `packages/drizzle-orm-<d>-core/` | `package.json`, `tsconfig.json`, `tsconfig.build.json`, `vite.config.ts`, `vitest.config.ts`, thin `README.md`, a `CLAUDE.md` carrying ONLY what is specific to this dialect |
| `src/` | `columns.ts`, `table.ts`, `helpers.ts`, `views.ts`, `drizzle.ts`, `index.ts` |
| `src/` tests | `index.spec.ts` (the equality matrix), `type-pins.stub.ts`, `typeTables.spec.ts`, `valueHelpers.spec.ts`, `manifest-coverage.spec.ts` |
| repo root | a `drizzle-dialects.json` row, a `tsconfig.json` reference, the `lint:eslint` glob AND the lint-staged glob in `package.json`, the vitest project list |
| e2e | its own lane and image, per "Adding an e2e image" below |

`package.json` specifics that are easy to get wrong:

- `versionLine: "drizzle-orm"` — this is what puts the package on the drizzle
  version line instead of the lockstep train. Release membership is automatic
  from that marker; `pnpm rtx release check-drizzle-versions` guards it.
- version aligned to drizzle's minor, not to the rest of the monorepo.
- three peers: `drizzle-orm` (optional, its own minor range), `@mionjs/run-types`
  (a RANGE, not a pin, so the consumer's single copy supplies both the format
  types and the runtime `getRunType`) and `@mionjs/drizzle-orm` (own minor range).
- `@mionjs/run-types` and `@mionjs/drizzle-orm` ALSO as `workspace:*`
  devDependencies, the one place per-package devDeps are allowed, so the package
  satisfies its own peers inside the workspace.
- the `./drizzle` subpath export, with a `source` condition like the root one.

Then regenerate (`pnpm rtx core drizzle-manifest`) and get every gate green.

## Both translate roads are part of the dialect

A dialect is not done when its builders compile. It is done when drizzle code
**translates onto it**, and that translation **converts to the pure-type road**.
A new dialect supports every feature the older ones do, or it is half a dialect.

**Road 1 — `mion drizzle-migrate`, drizzle to mion.** Driven by
`ts-go-runtypes/internal/drizzlemigrate/importmap.json`, generated by joining
`drizzle-dialects.json` with the per-package manifests. A `migrated` export moves
to the wrapping package under the same name; everything else stays on drizzle.
Never hand-edit that map — flip an entry's `status` in its manifest and
regenerate. `migrateAlias` (in the dialect's `drizzle-dialects.json` row) is its
only hand-owned input, for a name whose DRIZZLE spelling is still needed in the
same file; `sql` is the only one today.

**Road 2 — `mion convert --to type`, builders to pure types.** Needs, per
column: the `typeAlias` recorded in the manifest, a key in `ColMods`
(`packages/drizzle-orm/src/typeColumns.ts`), the name in `colModNames` there AND
in `drizzleModNames` (`ts-go-runtypes/internal/convert/drizzle.go`), and the same
flag transitions in `ModNotNull` / `ModHasDefault` / `ModInsertExcluded`. Gated
by `colMods.spec.ts`, `TestDrizzleModNamesMatchManifests` and each dialect's
`manifest-coverage.spec.ts`.

**Run the host half first.** `pnpm rtx core drizzle-translate [--to-types]` does
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
   `pnpm rtx core drizzle-suites --record` on a trusted network and eyeball the
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
8. **Publish the image.** `pnpm rtx container build-image drizzle-<lane>`, then
   `pnpm rtx container push drizzle-<lane>`. **CI never builds these images**, it
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
