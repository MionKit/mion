---
name: drizzle-slim-schemas
description: Add/update slim drizzle recorders + e2e lanes: pending manifest entries, failed check, new dialect/driver.
---

# drizzle-slim-schemas

Use [the tool mapping](../TOOLS.md) for assistant-specific calls and fallbacks.

- Drizzle family = SLIM RECORDERS. Design + why → [ARCHITECTURE.md](ARCHITECTURE.md).
- Tables authored as drizzle tables (drizzle's names + config), except a column takes every setting in ONE props
  object (`varchar('name', {length: 100, notNull: true})`), no modifier chain.
- Every function comes from OUR packages, records its call at runtime, never runs drizzle.
- `toDrizzle()` traverses the recorded graph and replays it 1:1.

## Packages

- `packages/drizzle-orm` (`@mionjs/drizzle-orm`): dialect-agnostic core. Consumers import ALL of it from here directly:
  - column types: `src/types.ts` (`Column`, `ColMods`, the flag derivation), `src/columns.ts` (`colModNames`, `$type`);
  - `recordColumn`: splits a builder's props into drizzle's config argument + its modifier calls;
  - RtColumnRecorder, RtEntryRecorder (index/constraint chains), RtValueRecorder (enum/schema/sequence/role handles);
  - sql recorder + sql template, createRtTable/materializeRtTable, `tableRef`;
  - flat InferSelectModel/InferInsertModel, refineTableType.
- `packages/drizzle-orm-<dialect>-core`: dialect surface.
  - `src/columns.ts`: column builders + their column types.
  - `src/types.ts`: each builder's config, data type, `*ColMods` bag, props interface; shared table/view/entry types.
  - `src/table.ts`: table factories/schema handles. `src/helpers.ts`: index, constraints, checks, enums, policies.
  - `src/drizzle.ts`: toDrizzle + synthesized drizzle table typing. `src/index.ts`: package root module.
  - Dialect index exports ONLY its own local surface. Never re-exports the core package or anything not its own.

## Manifests

- Committed manifests = source of truth for coverage. One `manifests/*.manifest.json` per package,
  root drizzle-orm module included.
- Go generator `ts-go-runtypes/cmd/gen-drizzle-manifest` (driven by hand-owned `drizzle-dialects.json`)
  decides WHAT needs review. This skill decides HOW each entry maps.
- `localExports` counts declarations in the package (relative re-exports followed). Re-exports from drizzle never count.

## The loop

1. `pnpm miondevx core drizzle-manifest` regenerates the manifests. Statuses preserved.
   New drizzle exports arrive `pending`. A `migrated` entry whose recorded params drifted
   → downgraded to `pending`, old shape in `reason`.
2. `pnpm miondevx core drizzle-manifest --pending` prints the review queue.
3. Run the **boundary pass** (below) over the queue. Get decisions confirmed BEFORE authoring anything.
4. Per pending entry apply the confirmed decision: author a recorder ([authoring.md](authoring.md)),
   flip to `migrated`; or flip to `skipped` with one boundary-pass reason verbatim.
5. `pnpm miondevx core drizzle-manifest` again (canonical formatting),
   then `pnpm miondevx core drizzle-manifest --check` until green.
   Per-package manifest-coverage specs + completeness specs must pass too.

## The boundary pass

- Every pending entry = a decision on WHICH SIDE OF THE LINE a drizzle feature lives.
- ⚠️ Never decide on instinct: a feature the app reads a type from, skipped by mistake, is never flagged
  by a later regeneration.

1. **The rule.** Read it in [packages/drizzle-orm/AGENTS.md](../../../packages/drizzle-orm/AGENTS.md)
   (the two questions + the one exception for views built from a query builder). Never restate or reinterpret it here.
2. **The reasons.** A `skipped` entry carries EXACTLY ONE of these, verbatim. Each names the question it failed,
   so the manifest reads as a record of the boundary, not free-text notes:
   - `db/query layer: call drizzle on the toDrizzle() result`: drizzle-kit never reads it off the schema file,
     no app type comes from it. Operators, aggregates, set operations, aliases, config readers, relations.
   - `needs drizzle's select typing: declare with drizzle over toDrizzle() tables`: the query-builder-view
     exception, the ONLY reason allowed to skip something drizzle-kit does read.
   - `class or constant; passes through via export *`: generator-owned, never hand-written.
   - EVERY `column` entry must end `migrated` (no export-star to fall through to).
3. **Precedent, then ask.** Per pending entry, read the SIBLING dialects' committed manifests: what they decided
   for the same export or its dialect-prefixed analogue (`mysqlView` ↔ `pgView` ↔ `sqliteView`).
   - Present the queue as a table: entry, proposed decision, reason, sibling precedent.
   - Confirm it with the available question tool before writing a single recorder.
   - Default answer = "same as the siblings" (covers nearly every entry for a new dialect).
     The pass exists for the few with no precedent, where a wrong call is expensive.

## Detail pages

- Column builder, entry/value helper, new modifier, tests: [authoring.md](authoring.md). Read before writing a recorder.
- New dialect or driver, both translate roads: [dialect.md](dialect.md). Read before adding a dialect or driver.
- New e2e lane or image: [e2e-lane.md](e2e-lane.md). Read before touching `container/drizzle-e2e/`.

## Label the PR

- drizzle-e2e lane is expensive: runs only on a PR into `prod` whose drizzle sources changed,
  or on **any PR carrying the `drizzle-e2e` label**.
- PR touching `packages/drizzle-orm*`, `container/drizzle-e2e/`, `drizzle-dialects.json` or `drizzle-suites.pin.json`
  MUST get the `drizzle-e2e` label **when opened**. Add it with the GitHub MCP tools right after creating the PR.
- Label added once: survives new pushes, `synchronize` re-runs the lane on every new commit while it is on.
- Change adds a NEW image → push it to GHCR before adding the label, else the lane fails on its pull step,
  telling you nothing useful.
