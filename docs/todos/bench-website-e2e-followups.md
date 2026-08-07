---
type: fix
spec: full-plan
status: open
created: 2026-08-07
---

# Benchmarks / website / e2e follow-ups (container lanes)

Six container-lane items, consolidated 2026-08-07 from six standalone specs
(original names in each item header). Items 1 and 2 share a root cause
(nothing typechecks `container/benchmarks`) and are best done together; the
rest are independent. Item 6 is blocked on an upstream TypeBox release.

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
## Item 5 — Zero-pad the remaining website content dirs before a 10th page silently reorders them (chore, guidelines, 2026-07-31, was website-content-zero-pad-numeric-prefixes.md)


Found when the json-schema rollout made `2.guide/` the first content dir with ten pages: Nuxt Content sorts numeric prefixes lexicographically, so `10.linting.md` rendered as the SECOND nav entry (`1 < 10 < 2`). Fixed for `2.guide/` on the rollout branch by zero-padding to `01.`–`10.`; every other dir still uses single-digit prefixes.

### Problem

The failure mode is invisible in review: adding a 10th file looks fine in the diff, nothing errors, and only the rendered nav order is wrong. Current counts under [container/website/content/](../../container/website/content/) as of 2026-08-07: `1.introduction/` 4 pages, `3.ai-integration/` 4, `7.benchmarks/` **8** (was 9 before the json-schema bench page folded into the validation sections) — two more benchmarks pages trip it. The top level (4 dirs plus `8.diagnostics.md` and `index.md`) is safe for the foreseeable future.

### Fix

`git mv` zero-pad the pages in the remaining dirs (`01.` style, matching `2.guide/`). Nuxt strips the numeric prefix from slugs, so URLs are unchanged (`1.` and `01.` produce the same route — verified when fixing the guide). Then sweep references to the old file paths: inter-doc citations in `docs/` and other content pages are NOT covered by the in-container `pnpm run check-links` (that checks code-import paths), so grep for the old names explicitly.

Alternative considered: pad only `7.benchmarks/` now and the others on touch. One mechanical sweep is cheaper than re-discovering this three more times.

### Done when

- Every content page uses a two-digit prefix; nav order verified rendered (`pnpm rtx website dev --agent` or `pnpm rtx website check`); no stale references to the old filenames anywhere in the repo.
## Item 6 — Add TypeBox as a third document reader once Schema.Compile ships (feature, guidelines, BLOCKED upstream, 2026-08-03, was typebox-json-schema-document-column.md)


Blocked on an upstream release. Raised while building the JSON Schema
spec-conformance section
([json-schema-spec-conformance-section.md](../done/json-schema-spec-conformance-section.md)),
which today compares only ts-runtypes and ajv because they are the only two
libraries that can take a schema document as input.

### Why it is blocked

TypeBox's next major adds a `Schema.Compile` entry point that consumes a plain
JSON Schema document:

```ts
const VectorB = Schema.Compile({
  type: 'object',
  required: ['x', 'y', 'z'],
  properties: {x: {type: 'number'}, y: {type: 'number'}, z: {type: 'number'}},
})
```

That is exactly the door the conformance section needs. It is **not published**:

- Pinned in the bench image: `@sinclair/typebox@0.34.49`. Its main entry exports
  no `Schema` at all (verified by enumerating the ~200 exports).
- Latest on npm at the time of writing: **0.34.52**. No 1.x, and the only
  prereleases are `0.32.0-dev-*`.
- Empirically, on the pinned build: `TypeCompiler.Compile({type: 'string'})`
  fails with `Preflight validation check failed to guard for the given schema`,
  and `Type.Unsafe({type: 'string'})` compiles to `Unknown type`. The compiler
  dispatches on TypeBox's own `Kind` symbol, which a plain document lacks.

A git dependency is not an option: the bench `_deps` policy is registry-only
(`allowNonRegistryProtocols: false`) with exact pins and a 30-day
`minimumReleaseAge`.

### Direction

When TypeBox 1.x publishes:

1. Bump `container/benchmarks/_deps/competitors/typebox/package.json` and
   rebuild + republish the website image (`pnpm rtx container push website`).
2. Add `container/benchmarks/competitors/typebox/specCases.ts`, importing the
   shared documents exactly the way `competitors/ajv/specCases.ts` does. It must
   NOT re-author them; the point is that all readers compile the same bytes.
3. Add `'typebox'` to `SPEC_COMPETITORS` in
   [scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)
   and in `buildSpecBench` in
   [scripts/website/bench-data/gen-docs.mjs](../../scripts/website/bench-data/gen-docs.mjs).
   Both lists are deliberately one line each so this stays a small change.
4. Update the Correctness page prose, which currently states that only two
   libraries can read a document.

Expect divergences rather than a clean column, and treat them as findings about
TypeBox rather than about us. Two are already proven on 0.34.x: it accepts
`propertyNames` and `dependentRequired` into a schema object and never compiles
either into a check. Also note TypeBox targets **Draft 7** while the corpus is
2020-12, so tuple-shaped cases (`prefixItems` versus `items: [...]`) may need a
per-case note.

### Done when

The conformance table shows a third column, populated from the same shared
documents, and any TypeBox divergence is either explained on the page or filed.
