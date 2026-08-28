---
name: drizzle-proxy-migration
description: Author or update the slim drizzle recorders of @mionjs/drizzle-orm and the @mionjs/drizzle-orm-<dialect>-core packages from the committed drizzle manifests. Use whenever any packages/drizzle-orm*/manifests/*.manifest.json has pending entries, when `pnpm rtx core drizzle-manifest --check` fails (new drizzle exports, drifted param shapes, migrated entries missing from a package), when a dialect completeness spec reports a drizzle builder grew a modifier, after a drizzle-orm version bump, when adding a new dialect package, or when adding/changing a column builder or authoring helper in a package's src. Drives the whole loop, regenerate the manifests, map each pending entry to a slim recorder with a named data type (or skip it with a reason), add the paired tests, flip the status, and get the check green.
---

# drizzle-proxy-migration

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
3. For each pending entry decide: author a recorder (below) and flip to
   `migrated`, or flip to `skipped` with a WRITTEN reason. The standing reasons:
   - query/db-side functions (operators, alias, getTableConfig, set
     operations, relations): `db/query layer: call drizzle on the toDrizzle()
     result`.
   - views: `views are query-layer in v1: declare them with drizzle directly,
     querying toDrizzle() tables`.
   - EVERY `column` entry must end `migrated` — passthrough columns no longer
     exist (there is no export-star to fall through to).
4. `pnpm rtx core drizzle-manifest` again (canonical formatting), then
   `pnpm rtx core drizzle-manifest --check` until green. The per-package
   manifest-coverage specs and completeness specs must pass too.

## Authoring a column builder

In `src/columns.ts` of the dialect package, one block per column function:

1. **Named data type first** (the pure-types vocabulary): PascalCase of the
   function name, mode/param generics resolving to the runtype format the
   column stamps (`Varchar<L>` is `String<{maxLength: L}>`, `Timestamp<Mode>`
   picks Date vs StringDateTime, enum tuples become literal unions via the
   `EnumOr` helper). Formats live in `@ts-runtypes/core/formats`; pick per the
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
what caught the modifier in the first place.

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

## Adding a dialect package

Copy an existing dialect package skeleton: package.json with
`versionLine: "drizzle-orm"`, drizzle-aligned version, peers `drizzle-orm`
(optional, own minor range), `@ts-runtypes/core` (version.json's minor) and
`@mionjs/drizzle-orm` (own minor range) plus the matching `workspace:*`
devDependencies; the `./drizzle` subpath export; tsconfigs and vite/vitest
configs; the four src files. Add its row to `drizzle-dialects.json`, its
vitest config to the root project list, and regenerate. Release membership is
automatic via the `versionLine` marker (`pnpm rtx release
check-drizzle-versions` guards the contract; the root `@mionjs/drizzle-orm`
package rides the same line with `noColumnBuilders: true` in its row).
