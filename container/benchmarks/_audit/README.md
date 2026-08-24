# Cross-library validation alignment audit

An analysis pass over the benchmark suite that explains every place a competitor
(zod, TypeBox, ajv, typia) disagrees with ts-runtypes about what counts as a valid
value. It does not change the library, the rewrite pipeline, or any competitor
case file. Its deliverable is the committed report at
[`docs/cross-library-validation-alignment-report.md`](../../docs/cross-library-validation-alignment-report.md).

## Why it exists

The runtime benchmark stays green by design: a competitor can replace the shared
samples for a case with a `SampleOverride`, or opt out with `NOT_SUPPORTED`. Both
hide real divergences. The audit looks behind them by running each competitor's
real validator against the SHARED (ts-runtypes-authored) samples, never the
competitor's override, and recording every individual sample where the answer
differs.

## Pieces

- The collector lives in the shared harness:
  [`shared/harness/audit.ts`](../shared/harness/audit.ts) (`auditCompetitor`,
  `writeAudit`, `maybeAudit`). Each competitor's `main.ts` calls `maybeAudit`,
  which under `RT_AUDIT_ALIGNMENT=1` emits `results/<name>.alignment.json` and exits
  before the timing bench runs, so the same built bundle serves both modes.
- [`run-audit.mjs`](./run-audit.mjs) joins every `results/*.alignment.json` into
  `results/alignment-misalignments.json` and prints a per-competitor summary.
- [`classify.mjs`](./classify.mjs) buckets each live finding by root cause, writes
  one markdown file per finding into `findings/`, harvests the declared
  divergences (NOT_SUPPORTED reasons and override notes) from each `cases.ts`, and
  writes `classification-summary.json`.
- [`host-collect.mjs`](./host-collect.mjs) runs the transform-free competitors
  (zod, TypeBox, ajv) directly on the host, no container needed.

## Run it

Full run, all five competitors, inside the shared image (canonical):

```bash
pnpm rtx bench audit
```

Host-only, the three transform-free competitors (fast iteration). Requires `tsx`
plus zod / @sinclair/typebox / ajv / ajv-formats resolvable from
`competitors/<name>/` (for example a `container/benchmarks/node_modules`):

```bash
RT_AUDIT_TSX=/path/to/tsx node _audit/host-collect.mjs
node _audit/run-audit.mjs
node _audit/classify.mjs
```

ts-runtypes is the reference (zero divergences against the shared truth by
construction, since the samples encode its semantics and it carries no overrides).
typia needs its in-container build-time transform to produce validators, so its
divergences are read from the 50 override notes it already carries; the full
`pnpm rtx bench audit` run executes it for real.

## Outputs

- `results/<name>.alignment.json` per competitor (git-ignored, like all results).
- `results/alignment-misalignments.json` the joined table.
- `findings/*.md` one classified finding per live divergence.
- `classification-summary.json` machine-readable roll-up.
- `docs/cross-library-validation-alignment-report.md` the committed write-up.
