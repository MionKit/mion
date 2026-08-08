---
type: feature
spec: full-plan
status: ready
created: 2026-08-08
---

# Run the benchmarks under Bun in the release lanes, and prove the engine branch fired

## Problem

`rt::countEnumKeys` now picks its counter per engine: `for-in` on V8, a
prototype-guarded `Object.keys` on JavaScriptCore, decided once at materialisation
(see [runtime-aware-key-counting](../done/runtime-aware-key-counting.md)). Two gaps
follow from that, and the second one is worse than it looks.

**1. The JSC branch has never executed on JSC in CI.** Correctness is covered:
[countEnumKeys.test.ts](../../packages/ts-runtypes/test/features/countEnumKeys.test.ts)
forces both counters under Node by defining a `Bun` global while the factory runs, and
pins that they answer identically. But the real path has only ever run by hand, in a
sandbox where Bun happened to be preinstalled. Nothing in the repo declares Bun: no
package.json entry, no lockfile, no `bunfig.toml`, no CI action, no Containerfile
install. The only references are an optional `exec.LookPath("bun")` fallback for the
format-pattern sidecar, the `Bun` entry in `allowedGlobals`, and a deferred
Bun-loader idea in the roadmap.

**2. The benchmark suite does not exercise the strict path at all.**

```
grep -rn "createHasUnknownKeysFn\|runsAfterValidation" container/benchmarks/
→ (nothing)
```

Every case builds `createValidateFn` (plus the `validationErrors` variant). Nothing
calls `hasUnknownKeys`, so `rt::countEnumKeys` is never invoked by the benchmarks.
Running the existing suite under Bun would therefore be a green lane proving nothing
about the branch it is meant to cover. **Strict cases have to land first or the rest
of this is decorative.**

## Decisions already taken

Settled with the maintainer before this spec was written; treat them as constraints,
not options.

- **Not on the PR path.** No Bun lane in [ci.yml](../../.github/workflows/ci.yml).
  This lives in the release lanes only.
- **Bun runs the COMPILED JavaScript**, never TypeScript. No `bun test`, no bun TS
  loader, no bun-specific APIs. Each competitor already builds to `dist/run.mjs`; Bun
  runs that exact bundle. One build, two runtimes.
- **Website publishes Bun numbers only for the cases where the engine matters** (the
  new strict group), not a runtime dimension across all 263 cases.
- **Throughput never hard-fails**, with one deliberate exception (below).
- **Small strict group**, not a third harness metric.

## Plan

### Stage 1 — a strict case group (prerequisite)

Add a `STRICT` group under
[container/benchmarks/shared/cases/](../../container/benchmarks/shared/cases/) whose
cases are measured as the full strict path, `validate(v) && !hasUnknownKeys(v)`.

Keep it small: a flat all-required object, a nested all-required object, and the
`ToBeChecked` moltar DTO (already present in
[realworld](../../container/benchmarks/shared/cases/realworld/index.ts)), since that
last one is the shape the published comparison measures.

This is meaningfully cross-library, not a RunTypes-only vanity group: TypeBox has
`additionalProperties: false`, zod has `strictObject`, ajv has `additionalProperties`.
The `CaseKey` union is derived from the suite objects, so TypeScript forces every
competitor to supply an entry or an explicit `NOT_SUPPORTED` — there is no way to add
this group and silently leave a competitor out.

RunTypes entries use `createHasUnknownKeysFn<T>(undefined, {runsAfterValidation: true})`
composed with `createValidateFn<T>()`, which is the only combination that reaches
`countEnumKeys`.

**Verify before moving on:** grep the built
`competitors/ts-runtypes/dist/run.mjs` for `cntEK(` and confirm it appears. If it does
not, the group is not reaching the fast path and stages 2-4 are pointless.

### Stage 2 — Bun in the bench image

[container/website/Containerfile](../../container/website/Containerfile) bakes `/bench`
into `tsrt-website`. CI *pulls* that image and never builds it, so this is: add Bun to
the Containerfile, `pnpm rtx container push website`, and CI picks it up on the next
pull. Scope note: this makes Bun a dependency of the **bench image only** — not the
host toolchain ([SETUP.md](../../SETUP.md) stays unchanged), not PR CI.

Pin the Bun version in the Containerfile. Reproducibility wins here; catching a future
engine flip is stage 4's job via the recorded numbers, not via an unpinned runtime that
could turn a release gate red without a code change.

Add a line to the [benchmarks README](../../container/benchmarks/README.md) stating
Bun is image-only and why.

### Stage 3 — run both runtimes, and record which branch fired

[scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)
currently runs, per competitor:

```
cd competitors/<name> && pnpm run build && node dist/run.mjs
```

Make that one build followed by two runs, `node dist/run.mjs` then `bun dist/run.mjs`.
A useful side effect: this is also the first check that the emitted bundle is
runtime-portable at all.

`writeResult` ([result.ts](../../container/benchmarks/shared/harness/result.ts)) writes
`results/<name>.json`, so results need a runtime dimension — `results/<name>.<runtime>.json`
plus a `runtime` field on the record — and [aggregate.mjs](../../container/benchmarks/aggregate.mjs)
needs to join on it.

**The engine-branch assertion** is the load-bearing piece, and there is already
precedent for exactly this shape:
[competitors/ts-runtypes/setup.ts](../../container/benchmarks/competitors/ts-runtypes/setup.ts)
throws when `Temporal` is missing, specifically so a misconfigured runtime fails loudly
instead of quietly producing garbage samples. Add the same kind of startup assertion:

- materialize `rt::countEnumKeys` and detect which counter came back (the `Object.keys`
  spy the vitest suite already uses),
- assert it matches what this engine should have chosen — `Object.keys` under Bun,
  `for-in` otherwise — and throw on mismatch,
- record it on the result as `engineBranch: 'jsc' | 'v8'`, so the CI step asserts a
  recorded value rather than trusting a silent pass.

That one field fails the lane if Bun stops being detected, if the branch is deleted, or
if the lane accidentally runs Node twice under a Bun label. **This, not the throughput
numbers, is what proves the branch is doing its job.**

### Stage 4 — wire the lanes, with asymmetric failure

Two release lanes run benchmarks, and they get different treatment on purpose.

**`release-gate.yml`'s `benchmarks` job** (`ubuntu-latest`, also reached by
[pre-publish.yml](../../.github/workflows/pre-publish.yml) via its `gate` job) —
add the Bun run.

- **Blocking:** the engine-branch assertion, and the correctness checks the runner
  already performs against each case's valid/invalid samples. A wrong answer under Bun
  is a release blocker.
- **Not blocking:** throughput. Record and print it; assert nothing. A shared runner
  cannot support a ratio assertion, and a flaky release gate is a release gate people
  learn to bypass.

**`website-deploy.yml`** (`linux-arm64`, the higher-capacity runner) — this is the one
place throughput DOES fail the job, and the deploy must still happen. Order the steps
so the perf assertion runs **after** the "Deploy to Cloudflare Pages" step: the site
ships, then the job goes red, so a regression is loud without holding the docs hostage.

⚠️ **Do not enable that assertion blind.** Every measurement behind this design
(`~25.2 → ~17.6 ns/op` on the strict path, the whole for-in/Object.keys inversion) was
taken on **x64**. `website-deploy` runs on **arm64**, which has never been measured
here. So:

1. First land the lane recording numbers only, on both runners.
2. Read the arm64 results. Confirm the inversion actually holds there — Bun preferring
   `Object.keys`, Node preferring `for-in`.
3. Only then set a margin and turn the assertion on. Assert the **ranking with a
   margin** (the expected winner must not be more than X% slower than the loser), never
   absolute ns/op.
4. If arm64 turns out NOT to invert the same way, that is a finding in its own right and
   needs its own spec — the current branch keys off `typeof Bun`, not off architecture,
   so an arm64 divergence would mean the branch is wrong on some platforms. It would
   still be a performance-only bug (both counters are proven equivalent for every
   input), never a correctness one.

### Stage 5 — the website, for the strict cases only

Publish the Bun column for the strict group alone. The existing benchmark tables in
[container/website/content/](../../container/website/content/) stay single-runtime; the
strict group gets a Node-vs-Bun presentation because that is the one place the number
carries information a reader can act on.

Follow the house voice: no dashes chaining clauses, plain user-focused language, and no
mention of counters, enum caches, or structure property tables. What a reader needs is
"strict checks on Bun are this fast", not how it is implemented.

## Tests

- **JS** — the existing
  [countEnumKeys.test.ts](../../packages/ts-runtypes/test/features/countEnumKeys.test.ts)
  already pins counter equivalence under Node and needs no change. Add coverage for the
  new branch-detection helper if it is extracted into shared code (it should be, rather
  than duplicated between the vitest suite and the bench setup).
- **Bench** — the harness's own correctness pass covers the new strict cases on both
  runtimes for free, since it checks every case against its valid/invalid samples before
  timing it.
- **Alignment audit** — run `pnpm rtx bench audit` after adding the group; strict cases
  are exactly the kind where competitors' closedness semantics can legitimately differ,
  and any divergence must be recorded rather than silently absorbed.
- **Marker rule** — no `getRunTypeId` surface is touched, so it does not apply. If a
  resolver-level test gets added, it must cover both call shapes per
  [CLAUDE.md](../../CLAUDE.md).

## Out of scope

- A Bun lane on the PR path. Explicitly rejected.
- Running the full JS test suite (vitest) under Bun. That needs the Go binary and the
  plugin, i.e. the whole bootstrap, for little signal over the pure-fn level.
- The third harness metric that would give every case a strict variant. Worth its own
  spec if the small group proves useful.
- A user-facing override to force a counter strategy. `registerPureFn` is exported, but
  `registerCore` returns the already-registered function when the key exists, so
  overriding a built-in looks like its own change — and the payoff is thin, since being
  wrong costs about 8 ns/call and never correctness.
- Detecting Deno or any engine beyond Bun. Deno is V8 and takes the default branch.
- Publishing a Bun column for all 263 cases.

## Done when

- A small `STRICT` group exists, every competitor supplies an entry or an explicit
  not-supported, and `cntEK(` is confirmed present in the built RunTypes bundle.
- Bun is pinned in the `tsrt-website` Containerfile, the image is pushed, and the
  benchmarks README records that Bun is image-only.
- Every competitor's compiled `dist/run.mjs` runs under both Node and Bun in the
  release-gate benchmarks job, with per-runtime result files.
- Each result carries `engineBranch`, and a mismatch (or a missing value) **fails** the
  release-gate job.
- Throughput is recorded on both lanes and asserted on neither, pending step 2 of
  stage 4.
- The arm64 numbers from `website-deploy` have been read, and either the ranking
  assertion is enabled there with a justified margin (failing the job *after* the
  deploy step), or this doc records why it was not and what arm64 actually showed.
- The website shows the Node-vs-Bun comparison for the strict group only, in the house
  voice.
