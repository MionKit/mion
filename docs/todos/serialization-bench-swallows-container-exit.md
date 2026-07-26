---
type: fix
spec: full-plan
status: ready
created: 2026-07-26
---

# The serialization bench stage swallows its container exit code

## Origin

Found 2026-07-26 while adding the post-build website render check
([scripts/website/check-static.mjs](../../scripts/website/check-static.mjs)), after the
2026-07-19 production deploy shipped `/benchmarks/serialization` and
`/benchmarks/serialization-formats` with no tables (both pages render the "Benchmark data
not generated yet" notice). Out of scope for that change — the check gates the ARTIFACT;
this is the reason a broken artifact was produced in the first place.

## The defect

[scripts/website/bench-data/bench.mjs](../../scripts/website/bench-data/bench.mjs)
`cmdSerialization` runs the in-container serialization generator and **ignores the result**:

```js
  run(
    cfg.engine,
    ['run', '--rm', '--init', /* … */ '-w', tsgo, cfg.image, 'sh', '-c', SERIALIZATION_SCRIPT],
    {stdio: ['ignore', 'inherit', 'inherit']},
  );
}
```

Every sibling stage checks: `cmdWebsiteBench` does `if (run('node', [gen-docs]) !== 0) die(…)`,
`cmdBuild` counts failures, `cmdCompiletime` prints a FAILED line. Only this one drops the
code on the floor.

`SERIALIZATION_SCRIPT` is
`node gen-serialization.mjs --suite serialization && node gen-serialization.mjs --suite format-serialization`,
and `gen-serialization.mjs` **wipes `OUT_DIR` before it writes** (`fs.rmSync(OUT_DIR, …)` then
`mkdirSync`). So a mid-run failure leaves the dataset deleted or half-written, `cmdWebsiteBench`
continues, the Nuxt build succeeds, the deploy job goes green, and the two serialization pages
ship empty. That matches the observed live symptom exactly: the two pages produced by this one
generator are blank while every other benchmark page renders.

Not yet established: WHY the run failed on 2026-07-19 (the job log needs a targeted read —
`gen-serialization.mjs` emits a per-suite summary line that is either absent or truncated in
that run). Fixing the swallowed exit code is correct regardless, and makes the next occurrence
self-reporting instead of silent.

## Fix

1. **Propagate the exit code** in `cmdSerialization`:

   ```js
   if (run(cfg.engine, [/* … */]) !== 0) die('bench: serialization bench failed - see output above');
   ```

   Both callers (`pnpm rtx bench serialization`, `cmdWebsiteBench`) then fail loudly, and
   `pnpm rtx website build` stops before building a site around missing data.

2. **Consider writing the dataset atomically** in
   [gen-serialization.mjs](../../scripts/website/bench-data/gen-serialization.mjs): build into
   a temp dir and swap it into place at the end, so a crashed run leaves the PREVIOUS dataset
   intact instead of deleting it. Optional, but it turns "half-written data" into "stale data",
   which the render check would pass and a human can then notice.

3. **Audit the sibling stages for the same pattern** while in there — `cmdSerialization` was the
   only unchecked `run(...)` at the time of writing, but the audit is cheap.

## Verification

- Force a failure (e.g. point `RT_BENCH_BIN` at a non-existent binary, or temporarily make
  `SERIALIZATION_SCRIPT` `false`) and confirm `pnpm rtx bench serialization` exits non-zero and
  `pnpm rtx website build` aborts at the benchmark stage rather than at the render check.
- Then confirm a normal `pnpm rtx bench serialization` still exits 0 and regenerates
  `container/website/public/bench-data/serialization{,-formats}/`.

The render check added alongside this todo (`pnpm rtx website check --static`) is the backstop,
not the fix: it catches an empty dataset at deploy time, several minutes after the stage that
actually failed.
