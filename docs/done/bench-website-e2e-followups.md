---
type: fix
spec: full-plan
status: done
created: 2026-08-07
---

# Benchmarks / website / e2e follow-ups (container lanes)

Six container-lane items, consolidated 2026-08-07 from six standalone specs
(original names in each item header). Items 1 and 2 share a root cause
(nothing typechecks `container/benchmarks`) and are best done together; the
rest are independent. Item 6 is blocked on an upstream TypeBox release.

## Outcome (2026-08-08)

**Items 1 to 5 shipped. Item 6 did not, and was SPLIT OUT** into
[typebox-json-schema-document-column.md](../todos/typebox-json-schema-document-column.md)
rather than parked here: it is blocked on a TypeBox release that has not
happened, so no amount of work on this branch could land it. Each item below
carries a "What shipped" note where the result differs from the plan as written.

**Everything was verified against a real image**, not just by the host-side
contract tests in `packages/ts-runtypes-devtools/test/bench-lane-contracts.test.ts`.
The published image could not be pulled (the environment's GitHub token carries no
package scopes and GHCR denies the pull-token exchange), so the image was built
locally from the same `Containerfile`. Observed:

| clause | result |
| --- | --- |
| `pnpm rtx bench typecheck` gates every competitor map | passes for all five, after fixing the drift it found on its first run (below) |
| typia `errored: 0` | `total 277, fail 0, errored 0`; `validationErrors` went from 195 errored to `ok=203` |
| a healthy zod run exits 0, prints no failure line | exit 0, no failure line, `fail: 3` (the three known divergences) intact |
| a broken lane still fails loudly | `DID NOT RUN (build or startup failed) - no results/<name>.json` + exit 1 |
| `--one` after an audit completes, aggregate included | exit 0, aggregate table rendered, six alignment artifacts skipped by name |

### The drift the gate found on its first run

`shared/harness/runner.ts:28` uses the type `NotSupported` in `asFn`'s signature
but never imported it — only the `NOT_SUPPORTED` value was in the import list. All
five projects failed with `TS2304: Cannot find name 'NotSupported'`. The file had
therefore never compiled, in the shared harness every competitor runs through.
Nothing caught it because nothing compiled it, which is the exact failure this
item exists to close; fixed here by adding the missing type import. The todo said
to expect the first run to surface more drift and to treat it as part of this
work, so it is fixed in the same change rather than filed.

## Item 1 — Benchmark competitor-map totality is declared but never enforced (chore, full-plan, 2026-07-30, was benchmark-competitor-maps-never-typechecked.md)


Found while adding the JSON Schema benchmark lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). Predates that work.

### Problem

Every competitor map declares itself total:

```ts
export type CompetitorCases = Record<CaseKey, CaseEntry>;   // shared/harness/types.ts
```

The design intent is "a new shared case key widens `CaseKey`, and every competitor map fails to compile until each key is filled or explicitly `NOT_SUPPORTED`" — compilation as the coverage proof. **Nothing in CI ever runs `tsc` over `container/benchmarks`**, so that proof does not exist:

- The root `typecheck` script covers `typecheck:test`, two `ts-go-runtypes/internal/testfixtures` projects and `packages/examples`. Never `container/benchmarks`.
- Each competitor's build is `vite build` (esbuild transpile, types stripped, no checking); typia's is `node esbuild.config.mjs`.

So a missing key is not a build failure, it is a silently absent column.

### Evidence it has already drifted

`competitors/ts-runtypes/schemaCases.ts` is annotated `CompetitorCases` and its header says "TOTAL over every key", but it was missing three keys that exist in `cases.ts`:

- `CIRCULAR_REFS.linked_list_cycle`
- `CIRCULAR_REFS.tree_cycle`
- `CIRCULAR_REFS.object_self_cycle`

The whole `CIRCULAR_REFS` group was simply absent. Its `tsconfig.json` does include the file, so a manual `tsc -p` would have caught it on the day it drifted. (Those three were filled in as part of the rollout, since that map was being extended anyway; the missing GATE is what this todo is about.)

### Why it is not a one-line fix

The competitor deps live only inside the `tsrt-website` image (`container/benchmarks/_deps/**`, installed per-competitor at `/bench/competitors/<name>/node_modules`), never on the host. A host-side `tsc -p container/benchmarks/competitors/ajv/tsconfig.json` fails on unresolved `ajv`. So the check has to run **inside the container**, which is why it was never wired into the root `typecheck`.

### Fix plan

1. Add a `typecheck` script to each competitor's in-container project (`tsc -p tsconfig.json --noEmit`), plus one for `shared/`.
2. Add a `typecheck` sub-verb to [scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs) that runs them all in the bench container, and surface it as `pnpm rtx bench typecheck`.
3. Call it from the `smoke` lane in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) (the job that already pulls the shared image), so a drifted map fails a PR.
4. Note in [container/benchmarks/README.md](../../container/benchmarks/README.md) that totality is enforced by that verb, not by the type annotation alone.

Expect the first run to surface more drift than the three keys above — treat whatever it finds as part of this todo.

### Done when

- `pnpm rtx bench typecheck` typechecks every competitor map plus `shared/` inside the container and exits non-zero on a missing or excess key.
- CI runs it, and deleting a key from any competitor map makes CI fail.

### What shipped

Step 1 was **dropped**, and the plan is better for it. Adding a `typecheck` script
to each `_deps/competitors/<name>/package.json` would have meant rebuilding and
republishing the `tsrt-website` image before CI could use the verb, and CI pulls
the published image rather than building one. Instead `cmdTypecheck` runs the
compiler straight out of the competitor's already-baked `node_modules`, so the
gate works against the image as published today. It prefers `tsgo` (TypeScript 7,
the compiler this project is built on) and falls back to the ts-runtypes lane's
`tsgo` and then to the local `tsc`, which is also what lets typia be covered: its
manifest carries no `typescript` at all.

`shared/` gets no project of its own either. Every competitor `tsconfig.json`
already `include`s `../../shared`, so it is compiled with each of them; a
standalone project would have had no `node_modules` to resolve `@types/node`
from. Two competitor `include` lists were widened, because the gate only proves
what the project compiles: `ts-runtypes/jsonSchemaCases.ts` is a full
`CompetitorCases` map that no entry point imports (typecost reads it as text), so
it would have stayed unchecked, and `specCases.ts` was reaching the graph only
transitively through `main.ts`.

The CI step deliberately does NOT set `RT_BENCH_NO_TYPIA`: type-checking typia
needs no `.ttsc` plugin, only building it does, so typia's map is gated even
though the build smoke still skips it.
## Item 2 — typia's validationErrors benchmark column is entirely broken: 195 errored cases (fix, full-plan, 2026-07-30, was typia-validationerrors-column-calls-a-removed-api.md)


Found while running `pnpm rtx bench --website` for the JSON Schema lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). **Not caused by that work** — the only change to `competitors/typia/cases.ts` there was ten `NOT_SUPPORTED` entries.

### Problem

Every `buildErrors` thunk in [container/benchmarks/competitors/typia/cases.ts](../../container/benchmarks/competitors/typia/cases.ts) calls `typia.createValidateFn()`. **That export does not exist** in the pinned version.

Evidence, read out of the shared image:

```
$ podman run --rm tsrt-website:dev sh -c "node -e \"…require('/bench/competitors/typia/node_modules/typia')…\""
13.0.0-dev.20260511
createAssert,createAssertGuard,createIs,createValidate,createAssertEquals,
createAssertGuardEquals,createEquals,createValidateEquals,createRandom
```

The function is `createValidate`. `createValidateFn` is a RunTypes name, not a typia one — it looks like it was pattern-matched from our own factory naming, or it is a typia 12 spelling dropped in 13.

Result, from `container/benchmarks/results/typia.json`:

```json
"summary": {"total": 276, "fail": 0, "errored": 195}
```

Per case, the `validate` metric is fine (it uses `typia.createIs`, which exists) while `validationErrors` errors with:

```
index.createValidateFn is not a function
```

`cases.ts` contains 195 occurrences of the bad name, which matches the errored count exactly.

### Why nobody noticed

- The error is a *runtime* failure inside a builder thunk, so the harness records `errored` per case and moves on. The lane produces a results file and looks like it ran.
- typia is the one competitor whose install is deliberately non-fatal in the Containerfile ("its column degrades gracefully"), so a blank typia column reads as normal.
- Nothing typechecks `container/benchmarks` (item 1 above) — `tsc` would have caught a nonexistent export on the typia namespace immediately. These two items share a root cause.

The visible consequence is that the two `getvalidationerrors` benchmark pages have been shipping with no typia column at all, and the correctness page counts typia as uncovered for that metric.

### Fix plan

1. Rename the call to `typia.createValidate` across `competitors/typia/cases.ts` (195 sites, mechanical).
2. Check the return shape: `createValidate` returns `IValidation<T>` (`{success, data|errors}`), so the thunks' `(v) => val(v).success` reading is probably already right — verify against one case rather than assuming.
3. Re-run `pnpm rtx bench --one typia` and confirm `errored: 0`.
4. Expect the correctness lane to gain real typia divergence records for the error path once the column actually runs; those are results, not regressions.

### Done when

- `results/typia.json` reports `errored: 0`.
- The `getvalidationerrors` and `getvalidationerrors-formats` pages render a populated typia column.
- The name is pinned so a future typia bump that renames it fails loudly (the typecheck gate in item 1 is the natural mechanism).

### What shipped

All 195 call sites renamed to `typia.createValidate`. Step 2's return-shape check
was done against typia 13.0.0-dev.20260511's own `lib/module.d.ts` rather than by
running a case: `createValidate<T>()` is declared as
`(input: unknown) => IValidation<T>`, so the existing `(v) => val(v).success`
reading was already correct and no thunk body changed.

A stale comment above the `JSON_SCHEMA` group was removed: that group had always
used the real export and carried a note explaining that the rest of the file did
not. Two pins were added on top of the item 1 gate, because the gate only runs in
the image: the file header now states which typia export backs each metric, and
`bench-lane-contracts.test.ts` checks every `typia.<name>` in the file against the
pinned 13.x export list, so an invented name fails `pnpm test` on the host too.

Confirmed on a real run: `results/typia.json` reports
`total 277, fail 0, errored 0`, and the `validationErrors` metric went from 195
errored cases to `ok=203, fail=0, notSupported=74`. The two
`getvalidationerrors` pages get a populated typia column from that data.
## Item 3 — The zod benchmark lane prints "FAILED" on every run, so a real break is invisible (fix, guidelines, 2026-07-30, was zod-bench-lane-permanently-reports-failed.md)


Observed while running `pnpm rtx bench --website` for the JSON Schema lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). **Not caused by that work** — the only change to `competitors/zod/cases.ts` there was ten `NOT_SUPPORTED` entries, and all ten report `not-supported`, not `fail`.

### What happens

`competitors/zod/main.ts` ends with:

```ts
process.exit(result.summary.fail + result.summary.errored ? 1 : 0);
```

zod's run has `fail: 3`, permanently:

| case | metric | detail |
| --- | --- | --- |
| `OBJECT.interface_all_optional` | `validationErrors` | `invalid[1] accepted` |
| `UTILITY.partial` | `validationErrors` | `invalid[1] accepted` |
| `UTILITY.deep_partial_recursive_mapped` | `validationErrors` | `invalid[1] accepted` |

All three are the same known semantic divergence: an all-optional zod object accepts a value RunTypes rejects. That divergence is **expected and already has a home** — it is exactly what the alignment audit and the [correctness page](../../container/website/content/7.benchmarks/8.correctness.md) exist to record.

So every single run prints:

```
==> competitor 'zod' FAILED (build or run) - see output above
```

`buildAndRunOne` ([scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)) logs and continues, so the pipeline still completes and the results JSON is still written.

**Scope: this is only about the per-competitor message.** The harness already gets the posture right one level up — the aggregate step prints `aggregate: cross-library correctness divergences reported above (non-zero exit) - continuing the publish pipeline`, which names exactly what happened and why it is not fatal. `buildAndRunOne` is the one place that does not distinguish, and it guesses wrong: it attributes a sample divergence to "build or run".

### Why it actually matters (observed, same run)

In the run where this was found, ajv **genuinely failed to build** (an unresolved import). Its line was:

```
==> competitor 'ajv' FAILED (build or run) - see output above
```

Byte-identical in shape to zod's standing message, and neither carries the distinguishing detail. The only way to tell "known divergence, results written" from "build broke, no results file at all" was to scroll the log, or to notice `ajv.json` was missing from `results/`. A per-competitor line that is always present for one lane trains the reader to skim past the line that matters.

### Direction

Separate "this competitor disagrees with RunTypes on a sample" from "this competitor's lane did not run". A sample disagreement is data for the correctness page and should not colour the exit code; a build failure or an errored case should. Roughly:

- Exit non-zero on `errored` only, and let `fail` ride the alignment output. Check the other four competitors first — if any of them also carry standing `fail` counts, this is a harness-wide decision, not a zod one.
- If a standing `fail` should stay loud, give it an expected-divergence allowlist keyed by case, so a NEW divergence is the thing that turns the lane red.
- Whichever way it goes, `buildAndRunOne`'s message should distinguish the two, since today it says "build or run" for both. The aggregate step's wording is the model to copy: say what happened and whether it is fatal. Mentioning the missing `results/<name>.json` when there is one would make a real break unmissable.

Worth confirming against [serialization-bench-swallows-container-exit.md](../done/serialization-bench-swallows-container-exit.md), which fixed the opposite failure mode (exit codes being lost); the fix here must not reintroduce that.

### Done when

- A healthy zod run exits 0 and prints no failure line.
- A genuinely broken competitor lane (build error, errored case) still fails loudly.
- The three known divergences remain visible on the correctness page.

### What shipped

The first option: exit on `errored` only. The other four competitors did not need
checking after all, because the exit line was **byte-identical in all five**
`main.ts` files, which makes it a harness-wide decision by construction rather
than a zod one. No allowlist was added; a standing `fail` is already recorded by
the alignment audit and rendered on the Correctness page, and `aggregate.mjs`
still lists every one of them by name and still exits non-zero, so the
divergences stayed exactly as visible as before.

`buildAndRunOne` now distinguishes the two cases by asking whether the lane wrote
its `results/<name>.json`: no file means the build broke and the column will be
missing, a file plus a non-zero exit means errored cases. Beyond the message, the
broken lanes are now **accumulated and reported as a non-zero exit** at the end of
`bench`, `bench-one` and `website-bench`, after aggregate and after the site data
is regenerated. That ordering is deliberate, and it is what keeps the
[serialization-bench-swallows-container-exit.md](serialization-bench-swallows-container-exit.md)
fix intact from the other direction: the lanes that did run still publish, and the
exit code still tells the truth.
## Item 4 — rtx bench --one crashes in aggregate if an audit ran first (fix, full-plan, 2026-07-30, was bench-one-aggregate-chokes-on-audit-results.md)


Hit while re-running a single competitor after a full `pnpm rtx bench --website`, during the JSON Schema lane work ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)).

### Problem

`container/benchmarks/aggregate.mjs:74` assumes every `results/*.json` is a competitor result:

```js
const byKey = new Map(results.map((r) => [r.competitor, new Map(r.cases.map((c) => [c.key, c]))]));
```

After an audit or typecost run, `results/` also holds files with no `cases` array:

```
ajv.alignment.json            typia.alignment.json
alignment-misalignments.json  zod.alignment.json
env.json                      ts-runtypes.compiletime.json
*.typecost.json               …
```

so aggregate dies:

```
TypeError: Cannot read properties of undefined (reading 'map')
    at file:///bench/aggregate.mjs:74:75
```

### Why only `bench-one`

The full path is safe by accident of ordering. `cmdFullbench` calls `clearResults()` with a predicate that wipes everything except `env.json` **before** any competitor runs, and the audit / typecost stages run **after** the aggregate. So aggregate only ever sees competitor files.

`cmdBenchOne` ([scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)) clears only `<name>.json`, by design — the whole point is to re-run one competitor and keep the rest. That leaves every audit / typecost / compiletime artifact in place, and aggregate then chokes on the first one.

The competitor's own results file **is** written correctly before the crash, so the damage is limited to the aggregate table and `publishDocdata` never running. The workaround is to re-run `node scripts/website/bench-data/gen-docs.mjs` by hand, which is what was done here.

### Fix plan

Filter in `aggregate.mjs` rather than in the caller, so the guard holds no matter which verb assembled `results/`:

1. Skip any parsed file lacking `Array.isArray(r.cases)` **and** a `r.competitor` string, rather than trusting the glob. A single `.filter()` at the read site covers `env.json`, `*.alignment.json`, `*.typecost.json`, `*.compiletime.json` and `alignment-misalignments.json` at once, and stays correct when a new artifact kind is added.
2. Log what was skipped at note level, so a genuinely malformed competitor file is not silently dropped.
3. Consider having `cmdBenchOne` finish with the same `gen-docs.mjs` step `cmdWebsiteBench` runs, so a single-competitor re-run actually refreshes the website data instead of only `.docdata/`.

### Done when

- `pnpm rtx bench --one ajv` immediately after `pnpm rtx bench --website` completes cleanly, aggregate table included.
- A competitor results file that is genuinely malformed still surfaces rather than being skipped quietly.

### What shipped

All three steps, including the optional step 3: `cmdBenchOne` now finishes with
the same `gen-docs.mjs` step `cmdWebsiteBench` runs, so a single-competitor re-run
refreshes the site's data instead of only `.docdata/`. Unreadable JSON is reported
separately from wrong-shape JSON, so a truncated competitor file reads as
"unreadable JSON", not as "some other artifact". `results[0].env.noTiming` was
also made optional-safe, since it was the next unguarded assumption on the same
line of reasoning.

This is the one item verified directly: `aggregate.mjs` is plain Node with a
`RT_BENCH_RESULTS_DIR` override, so the crash and the fix are both reproduced on
the host by `bench-lane-contracts.test.ts`, which runs it over a directory holding
a competitor result plus `env.json`, an alignment file, a misalignments file, a
typecost file, a compiletime file and a malformed file.
## Item 5 — Zero-pad the remaining website content dirs before a 10th page silently reorders them (chore, guidelines, 2026-07-31, was website-content-zero-pad-numeric-prefixes.md)


Found when the json-schema rollout made `2.guide/` the first content dir with ten pages: Nuxt Content sorts numeric prefixes lexicographically, so `10.linting.md` rendered as the SECOND nav entry (`1 < 10 < 2`). Fixed for `2.guide/` on the rollout branch by zero-padding to `01.`–`10.`; every other dir still uses single-digit prefixes.

### Problem

The failure mode is invisible in review: adding a 10th file looks fine in the diff, nothing errors, and only the rendered nav order is wrong. Current counts under [container/website/content/](../../container/website/content/) as of 2026-08-07: `1.introduction/` 4 pages, `3.ai-integration/` 4, `7.benchmarks/` **8** (was 9 before the json-schema bench page folded into the validation sections) — two more benchmarks pages trip it. The top level (4 dirs plus `8.diagnostics.md` and `index.md`) is safe for the foreseeable future.

### Fix

`git mv` zero-pad the pages in the remaining dirs (`01.` style, matching `2.guide/`). Nuxt strips the numeric prefix from slugs, so URLs are unchanged (`1.` and `01.` produce the same route — verified when fixing the guide). Then sweep references to the old file paths: inter-doc citations in `docs/` and other content pages are NOT covered by the in-container `pnpm run check-links` (that checks code-import paths), so grep for the old names explicitly.

Alternative considered: pad only `7.benchmarks/` now and the others on touch. One mechanical sweep is cheaper than re-discovering this three more times.

### Done when

- Every content page uses a two-digit prefix; nav order verified rendered (`pnpm rtx website dev --agent` or `pnpm rtx website check`); no stale references to the old filenames anywhere in the repo.

### What shipped

The full sweep, and one step further than the spec described: the **directories
and the top-level page were padded too** (`01.introduction/` … `07.benchmarks/`,
`08.diagnostics.md`). Padding only the pages inside the dirs would have left the
top level in the same trap, and padding `08.diagnostics.md` alone would have
actively reordered it against the unpadded dirs, since text sort puts `08.` before
`1.`. Either pad a whole level or none of it.

No content file needed editing: every internal link in the tree is a route
(`/guide/linting`), never a file path. The stale references were all outside
`content/`: `docs/WEBSITE-DOCGEN.md`, `docs/investigations/json-schema/README.md`,
`packages/ts-runtypes/test/json-schema-official/README.md`,
`container/website/CLAUDE.md`, and two example paths in comments in
`scripts/website/check-static.mjs`. The relative links in `docs/done/` were left
alone deliberately: that directory is an archive of what was true when each spec
landed, and rewriting history there buys nothing.

Rendered nav order is the one clause not checked in a browser here. It is now
**pinned by a test** instead of by a one-time look: `website-content-prefixes` in
`repo-contracts.test.ts` fails on any single-digit prefix anywhere under
`content/`, and `container/website/CLAUDE.md` states the rule for new pages. That
is the better guarantee anyway, since the failure mode is a trap for the NEXT
person rather than a state of the tree today. Route stability is independent of
the padding: `check-static.mjs` strips `^\d+\.` and finds the section with
`/^\d+\.benchmarks$/`, both of which match either form.
## Item 6 — Add TypeBox as a third document reader once Schema.Compile ships (feature, guidelines, BLOCKED upstream, 2026-08-03, was typebox-json-schema-document-column.md)

**Not shipped — split back out into its own spec:
[typebox-json-schema-document-column.md](../todos/typebox-json-schema-document-column.md).**

It is blocked on a TypeBox 1.x release that has not happened, so it could not
land with the other five and there is no half-done lane to park it in. The full
text (why it is blocked, the evidence gathered on 0.34.x, and the four-step
direction for when the release lands) moved to that spec unchanged, plus one
addition: the new competitor file has to be added to `competitors/typebox/
tsconfig.json`'s `include` so the typecheck gate from item 1 covers it.
