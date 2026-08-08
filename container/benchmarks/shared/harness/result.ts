// Per-competitor result JSON: each competitor's `main.ts` writes
// `<results>/<name>.json`; `aggregate.mjs` reads them all and joins by case key.
// This is what makes the runs independent (per-process isolation, Decision D).

import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';

export type CaseStatus = 'ok' | 'fail' | 'errored' | 'not-supported';

/** Per-metric result for one case (one of `validate` / `validationErrors`). */
export interface MetricResult {
  status: CaseStatus;
  /** ACCEPT-path throughput: function over the (resolved) valid samples, ops/sec.
   *  0 when not timed (RT_BENCH_NO_TIMING) or when there are no valid samples. */
  validOpsSec: number;
  /** REJECT-path throughput: function over the (resolved) invalid samples, ops/sec.
   *  0 when not timed (RT_BENCH_NO_TIMING) or when there are no invalid samples. */
  invalidOpsSec: number;
  /** MIXED-path throughput: function over valid + invalid samples interleaved,
   *  ops/sec — the realistic workload where input is neither all-good nor all-bad,
   *  so branch prediction can't settle. 0 when not timed or either path is empty.
   *  (Older result files predate this field; the docs derive it as the harmonic
   *  mean of valid + invalid when absent.) */
  mixedOpsSec: number;
  detail: string | null;
}

export interface CaseResult {
  key: string;
  suite: string;
  group: string;
  name: string;
  /** True when this competitor replaced the shared samples for this case. */
  samplesOverridden: boolean;
  /** The cheap boolean validator. */
  validate: MetricResult;
  /** The validation-errors function (boolean-wrapped: true = no errors). */
  validationErrors: MetricResult;
}

export interface MetricSummary {
  ok: number;
  fail: number;
  errored: number;
  notSupported: number;
}

export interface CompetitorResult {
  competitor: string;
  generatedAt: string;
  env: {node: string; timeMs: number; noTiming: boolean};
  cases: CaseResult[];
  summary: {
    total: number;
    validate: MetricSummary;
    validationErrors: MetricSummary;
    // Totals across BOTH metrics.
    //
    // `fail` = this competitor disagreed with a shared sample. Several do, by
    // design (an all-optional zod object accepts a value RunTypes rejects), so it
    // is DATA for the alignment audit and the Correctness page, never a broken
    // lane: it does NOT colour the process exit code.
    //
    // `errored` = a builder threw, so the metric produced no measurement at all.
    // That is a real break, and it is the ONLY thing each main.ts exits non-zero
    // on — which is what lets `bench.mjs` tell "did not run" from "disagreed".
    fail: number;
    errored: number;
  };
}

// Each competitor runs with cwd = container/benchmarks/competitors/<name>, so results live
// two levels up. The driver sets RT_BENCH_RESULTS_DIR explicitly for container runs.
const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), '..', '..', 'results');

const CASE_FILTER = process.env.RT_BENCH_CASE;

const ops = (n: number): string => (n ? `${Math.round(n).toLocaleString('en-US')}/s` : '-');
const metricLine = (metric: MetricResult): string =>
  `${metric.status}${metric.detail ? ` (${metric.detail})` : ''}  valid ${ops(metric.validOpsSec)}  invalid ${ops(metric.invalidOpsSec)}  mixed ${ops(metric.mixedOpsSec)}`;

// RT_BENCH_CASE inspection run (see runner.ts): print the matched cases and DON'T
// overwrite the canonical full-suite <name>.json — mirrors typecost so a per-case
// iteration loop never clobbers the published results.
function printFiltered(result: CompetitorResult): void {
  console.log(`\n[RT_BENCH_CASE=${CASE_FILTER}] ${result.competitor} - ${result.cases.length} case(s); results JSON not written`);
  for (const caseResult of result.cases) {
    console.log(`  ${caseResult.key}`);
    console.log(`    validate          ${metricLine(caseResult.validate)}`);
    console.log(`    validationErrors  ${metricLine(caseResult.validationErrors)}`);
  }
}

export function writeResult(result: CompetitorResult): void {
  if (CASE_FILTER) {
    printFiltered(result);
    return;
  }
  mkdirSync(RESULTS_DIR, {recursive: true});
  writeFileSync(path.join(RESULTS_DIR, `${result.competitor}.json`), JSON.stringify(result, null, 2) + '\n');
}
