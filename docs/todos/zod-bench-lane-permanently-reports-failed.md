---
type: fix
spec: guidelines
status: open
created: 2026-07-30
---

# The zod benchmark lane prints "FAILED" on every run, so a real break is invisible

Observed while running `pnpm rtx bench --website` for the JSON Schema lane ([json-schema-first-class-rollout.md](../done/json-schema-first-class-rollout.md)). **Not caused by that work** — the only change to `competitors/zod/cases.ts` there was ten `NOT_SUPPORTED` entries, and all ten report `not-supported`, not `fail`.

## What happens

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

## Why it actually matters (observed, same run)

In the run where this was found, ajv **genuinely failed to build** (an unresolved import). Its line was:

```
==> competitor 'ajv' FAILED (build or run) - see output above
```

Byte-identical in shape to zod's standing message, and neither carries the distinguishing detail. The only way to tell "known divergence, results written" from "build broke, no results file at all" was to scroll the log, or to notice `ajv.json` was missing from `results/`. A per-competitor line that is always present for one lane trains the reader to skim past the line that matters.

## Direction

Separate "this competitor disagrees with RunTypes on a sample" from "this competitor's lane did not run". A sample disagreement is data for the correctness page and should not colour the exit code; a build failure or an errored case should. Roughly:

- Exit non-zero on `errored` only, and let `fail` ride the alignment output. Check the other four competitors first — if any of them also carry standing `fail` counts, this is a harness-wide decision, not a zod one.
- If a standing `fail` should stay loud, give it an expected-divergence allowlist keyed by case, so a NEW divergence is the thing that turns the lane red.
- Whichever way it goes, `buildAndRunOne`'s message should distinguish the two, since today it says "build or run" for both. The aggregate step's wording is the model to copy: say what happened and whether it is fatal. Mentioning the missing `results/<name>.json` when there is one would make a real break unmissable.

Worth confirming against [serialization-bench-swallows-container-exit.md](../done/serialization-bench-swallows-container-exit.md), which fixed the opposite failure mode (exit codes being lost); the fix here must not reintroduce that.

## Done when

- A healthy zod run exits 0 and prints no failure line.
- A genuinely broken competitor lane (build error, errored case) still fails loudly.
- The three known divergences remain visible on the correctness page.
