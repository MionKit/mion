---
type: fix
spec: full-plan
status: done
created: 2026-07-26
completed: 2026-07-26
---

# The serialization bench stage swallows its container exit code

## Origin

Found 2026-07-26 while adding the post-build website render check
([scripts/website/check-static.mjs](../../scripts/website/check-static.mjs)), after the
2026-07-19 production deploy shipped `/benchmarks/serialization` and
`/benchmarks/serialization-formats` with no tables (both pages rendered the "Benchmark data
not generated yet" notice). Out of scope for that change — the check gates the ARTIFACT;
this was the reason a broken artifact was produced in the first place.

## The defect

[scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)
`cmdSerialization` ran the in-container serialization generator and **ignored the result**:

```js
  run(
    cfg.engine,
    ['run', '--rm', '--init', /* … */ '-w', tsgo, cfg.image, 'sh', '-c', SERIALIZATION_SCRIPT],
    {stdio: ['ignore', 'inherit', 'inherit']},
  );
}
```

`SERIALIZATION_SCRIPT` is
`node gen-serialization.mjs --suite serialization && node gen-serialization.mjs --suite format-serialization`,
and `gen-serialization.mjs` **wipes `OUT_DIR` before it writes** (`fs.rmSync(OUT_DIR, …)` then
`mkdirSync`). So a mid-run failure left the dataset deleted or half-written, `cmdWebsiteBench`
continued, the Nuxt build succeeded, the deploy job went green, and the two serialization pages
shipped empty — matching the observed symptom exactly (the two pages produced by this one
generator blank, every other benchmark page fine).

Never established: WHY the run failed on 2026-07-19. That job's log was not readable from the
session that found this. Moot going forward — the next occurrence is self-reporting.

## What shipped

**1. The exit code is propagated** (the fix):

```js
  const code = run(cfg.engine, [/* … */]);
  if (code !== 0) die('bench: serialization bench FAILED - see output above. …');
```

Both callers (`pnpm rtx bench serialization` and `cmdWebsiteBench`) now fail loudly, so
`pnpm rtx website build` stops at the benchmark stage instead of building a site around
missing data.

**2. The sibling audit found two more of the same pattern**, both fixed the same way:

- `cmdFullbench` + `cmdTypecost` ignored `typecost.mjs`'s exit code. Typecost feeds the second
  table on the Compile Time page, so it is the same silent-data-loss class.
- `cmdBuild(cfg, name)` — `pnpm rtx bench build <competitor>` reported success on a failed
  build, while the no-name loop directly below it already accumulated failures and exited
  non-zero. An inconsistency, not a deploy risk.

**Deliberately left alone** (these swallow or soften a code ON PURPOSE):

- `aggregate.mjs` in `cmdBench` / `cmdBenchOne` / `cmdFullbench` — it exits non-zero on an
  EXPECTED cross-library divergence (the Correctness page is built from those), so a non-zero
  exit is a report, not a failure. `cmdFullbench` already says so in a comment.
- `capture-env.mjs` — a failure only costs the "measured on …" banner; `gen-docs.mjs` already
  tolerates a missing `env.json`.
- `cmdCompiletime` / `cmdTransformWire` / `cmdAudit` per-competitor runs — they print
  `==> … FAILED` and keep going so one competitor can't take out the others' data.

**Not shipped: the atomic dataset write** (item 2 of the original plan — build into a temp dir
and swap it in, so a crashed run leaves the PREVIOUS dataset intact). It was optional then and
is not load-bearing now: with the exit code propagated, a failed run aborts the build, so a
wiped dataset can no longer reach a deploy. Revisit only if someone wants a failed local run to
keep its old data.

## Verification

A stand-in container engine on `PATH` (`RT_BENCH_ENGINE=fakengine`) that reports the shared
image present, the registry unreachable, and fails every `run` — exercising the real code path
end to end:

| verb                           | before | after  |
| ------------------------------ | ------ | ------ |
| `pnpm rtx bench serialization` | exit 0 | exit 1 |
| `pnpm rtx bench typecost`      | exit 0 | exit 1 |
| `pnpm rtx bench build zod`     | exit 0 | exit 1 |

The render check added alongside this todo (`pnpm rtx website check --static`) remains the
backstop, not the fix: it catches an empty dataset at deploy time, several minutes after the
stage that actually failed.
