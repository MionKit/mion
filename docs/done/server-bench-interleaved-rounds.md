---
type: feature
spec: guidelines
status: ready
created: 2026-11-07
---

# Server benchmarks: interleaved rounds, median published

## Intent

The HTTP server benchmarks (hello-world, light-validation, heavy-validation, payload-sizes) run each app
back to back: 5 s warm-up, then ONE 20 s wrk window, app after app. A short slowdown on the machine (noisy
neighbour, host GC burst) lands on one app's whole window and skews that one result. Comparing deploys showed
unchanged competitors moving ±10-15% between runs.

Split each measurement into rounds, interleave the apps across rounds, publish the median, and show the spread.

## Direction

Maintainer's decisions:

1. Default 4 rounds × 5 s for the request-rate suites (hello-world, light, heavy, ~1 KB payload).
2. Round-robin across ALL apps per round, never one app 4 times in a row. Deterministic order, start app
   rotated per round so no app is always first or last.
3. Warm-up 5 s in round 1, 2 s in rounds 2+ (each round restarts the server).
4. Bigger payloads (~50 KB, ~500 KB, ~4 MB) get longer rounds so each still collects enough requests; fewer
   rounds there is fine if total time would explode. Pick lengths from measured request counts, document
   the choice in the harness.
   Shipped: only ~4 MB needed it (3 × 10 s); ~50 KB and ~500 KB collect 1,500+ requests in 5 s.
   The choice is documented in `shared/rounds.mjs`, which the harness header points to.
5. Published number = MEDIAN of the rounds; also record per-round values and the spread so the pages can
   show it. Keep `ServerBenchBars.vue` and friends, `gen-servers-docs.mjs` and `check-static.mjs` in step.
6. A quick mode: one short run (`--rounds 1` and/or `--quick` on `miondevx bench servers`). Full mode stays
   the website-deploy default.
7. Full run wall-clock close to today's (≈ 5 s warm-up + 20 s per app/suite). Report before/after totals.
8. `repeat <app>` and the TOLERANCE gate stay coherent with rounds (round spread can feed the same check).
   Anything removed or renamed leaves no trace.

Pointers: harness `container/mion-bench/harness/run.mjs`, driver `scripts/website/bench-data/mion-bench.mjs`,
generator `scripts/website/bench-data/gen-servers-docs.mjs`, page component
`container/website/app/components/content/ServerBenchBars.vue`, env registry `scripts/lib/env.mjs`.
The implementer plans the details.

## Docs

`container/website/content/03.benchmarks/02.rpc/` pages: the method line and repeatability note come from the
dataset, so the component text and any page prose naming one 20 s window change with it.
`container/mion-bench/README.md` for the knobs.

Before opening the PR, run the simplify-docs pass (the `docs-simplifier` subagent) over every page and example
this change touched, review its report against the code, and commit it as its own commit.

## Done when

- Full run: rounds interleaved, median published, per-round values + spread in the dataset and on the page.
- `--quick` / `--rounds 1` gives a single short run.
- `repeat` checks the round spread against the tolerance.
- Tests pin the round order, median/spread merge and quick mode.
- Before/after total run time reported.
- The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.

## Plan: interleaved rounds (approved 2026-11-07, as shipped)

- `container/mion-bench/shared/rounds.mjs`: the plan (4 × 5 s everywhere, 3 × 10 s on ~4 MB; warm-up 5 s,
  then 2 s), the order (`roundOrder` rotates the start app by `floor(apps / rounds)` per round), `schedule`
  (round by round across every lane, so a lane's rounds sit far apart), `mergeRounds` (median of every rate,
  latency and memory figure; summed counts; per-round values + spread kept), and the result paths.
- Harness measures ONE round (`--round --warmup --duration`, passed by the driver) into
  `results/<lane>/rounds/<app>.r<n>.json`. The driver merges into `results/<lane>/<app>.json` and warns on any
  lane whose spread passes `MION_BENCH_TOLERANCE`.
- Knobs: `MION_BENCH_ROUNDS` (new, `--rounds <n>`), `MION_BENCH_REWARMUP` (new), `MION_BENCH_DURATION` now per
  round, `MION_BENCH_WARMUP` now round 1. `--quick` = 1 round × 3 s. The round knobs are read on the host only.
- A merged record is deleted only when its lane fails; an aborted run keeps the previous results.
  A bad `--rounds` / knob value (0, a fraction, not a number) stops the run before anything is touched.
- `repeat <app> [suite]` runs the lane's rounds and fails when their spread passes the tolerance; `--runs` is gone.
  `gcprobe` keeps its own 20 s windows (its GC ratios need 600+ requests).
- `gen-servers-docs.mjs` adds `rounds` + `spread` to each row and `rounds` / `warmup` / `rewarmup` to the meta;
  `ServerBenchBars.vue` prints the rounds in the method line, the spread under each name on the requests
  chart, the per-round rates in the name tooltip; `check-static.mjs` fails a dataset whose rows lack the rounds
  its meta says ran, or whose rows ran different round counts (a quick run mixed into a full one).
- Large payload (~500 KB) stayed at 4 × 5 s: measured 1,550-3,500 requests per round, enough.

Measured (4 vCPU): today's deploy spent 33 min on the server benchmarks (25.6 s per app/suite). Locally
hello-world went 307 s → 399 s, the sweep 1,158 s (estimated from the same 25.8 s per lane) → 1,952 s with
8 s/15 s big-payload rounds, which is why those were cut to 5 s/10 s. Full run estimate ≈ 45 min (+35%):
the floor set by the 2 s re-warm-ups and the restarts each round needs.
