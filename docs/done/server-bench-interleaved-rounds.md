---
type: feature
spec: guidelines
status: done
created: 2026-11-07
---

# Benchmarks in interleaved rounds, median published (server + RunTypes)

## Intent

Both timing benchmarks ran each competitor back to back in one window: the HTTP servers 5 s warm-up then one
20 s wrk window per app, the RunTypes validators one process per competitor timing every case for 100 ms. A
short slowdown on the machine (noisy neighbour, host GC burst) landed on one competitor's whole window and
skewed it: unchanged competitors moved ±10-15% between deploys.

Split each measurement into rounds, interleave the competitors across rounds, publish the median, keep the
per-round values and the spread.

## Direction (maintainer's decisions, as shipped)

1. Server request-rate lanes: 4 rounds × 5 s. Every round 2 s warm-up + 5 s run, round 1 included
   (each round restarts the server).
2. Round-robin across ALL apps per round, start app rotated per round, deterministic.
3. Bigger payloads get longer rounds where needed: only ~4 MB did (3 × 10 s, ~1 s per request at its 25
   connections); ~50 KB and ~500 KB collect 1,500+ requests in 5 s. The choice lives in
   `container/mion-bench/shared/rounds.mjs`.
4. Published number = median of the rounds; records keep each round and the spread; the server pages show
   the spread and the rounds.
5. Quick mode: `--quick` = one short round; `--rounds <n>` on both drivers.
6. `repeat <app>` runs one lane's rounds and fails when their spread passes `MION_BENCH_TOLERANCE`; a full
   run only warns. `--runs` is gone.
7. RunTypes validation (feeds the `validation` and `validation-formats` pages): every competitor process runs
   once per round, rounds interleaved across competitors and runtimes, each case publishes the median per
   stream. Scoring (worst status, not-supported counts) unchanged.
8. Serialization: unchanged. It already runs every competitor of a case back to back in one process and takes
   the median of 8 cycles. Typecost counts instantiations (exact, no noise). Compile time is not on the site.

## What shipped

- `container/mion-bench/shared/rounds.mjs`: plan, `roundOrder`, `schedule` (round by round across every lane),
  `mergeRounds` (median of every rate, latency and memory figure; summed counts; per-round values + spread),
  result paths. The harness measures ONE round (`--round --warmup --duration` from the driver) into
  `results/<lane>/rounds/<app>.r<n>.json`; the driver merges into `results/<lane>/<app>.json`.
- Server knobs: `MION_BENCH_ROUNDS` (new), `MION_BENCH_DURATION` now per round, `MION_BENCH_WARMUP` now per
  round (default 2). Read on the host only. A bad value stops the run before anything is touched. A merged
  record is deleted only when its lane fails, so an aborted run keeps the previous results. gcprobe keeps its
  own 20 s windows and 5 s warm-up (its GC ratios need 600+ requests).
- Server dataset: rows gain `rounds` + `spread`, meta gains `rounds` + `warmup`. `ServerBenchBars.vue` prints
  the rounds in the method line, the spread under each name on the requests chart, the per-round rates in the
  name tooltip. `check-static.mjs` fails a dataset whose rows lack the rounds its meta says ran, or whose rows
  ran different round counts.
- RunTypes: `scripts/website/bench-data/validation-rounds.mjs` (plan, schedule, merge). Each round's result
  goes to `results/rounds/<name>.r<n>.json` (bun: `results/bun/rounds/`), `MION_VALIDATION_BENCH_ROUND` tells
  the process which. Knobs: `MION_VALIDATION_BENCH_ROUNDS` (new, default 3), `MION_VALIDATION_BENCH_TIME_MS`
  now per round (default 50). Each metric keeps `rounds` + `spread`; the dataset cells carry `spread`.
- RunTypes window: 3 × 50 ms, not the suggested 4 × 25 ms. Measured against the 100 ms baseline (mion, node,
  263 cases, median ratio per case): 25 ms 0.91, 33 ms 0.95, 50 ms 0.97-0.98, a second 100 ms run 0.99. A
  warm-up of up to 75 ms in the same loop did not lift the 25 ms reading, so short windows simply read low.
  Full 5-competitor run at 3 × 50 ms: median ratio 0.96-0.98 per competitor.

## Measured (4 vCPU)

- Server: the deploy spent 33 min on the server benchmarks (25.6 s per app/suite). Locally hello-world
  went 307 s → 399 s with 5/2/2/2 s warm-ups; the full run is ≈ 77 lanes × (4 × 7 s + ~3 s restarts),
  about 40 min.
- RunTypes node lane: 864 s → 1,349 s (+56%: 150 ms of timing per case instead of 100, plus ~5 s per extra
  process). The deploy runs node + bun, so ≈ 26 min → ≈ 40 min.
- Round spread on this shared sandbox: server lanes 3-33%, RunTypes cases 15-35% median. The bench-report
  label measures it on the deploy runner.

## Done when

- [x] Rounds interleaved, median published, per-round values + spread in the records and on the server page.
- [x] `--quick` / `--rounds 1` gives a single short run, both drivers.
- [x] `repeat` checks the round spread against the tolerance.
- [x] Tests pin round order, schedule, median/spread merge, quick mode, the run loop and the dataset shape.
- [x] Before/after run time reported.
- [x] The simplify-docs pass ran on every touched page and the simplify-comments pass on every touched source
  file, each committed on its own.
