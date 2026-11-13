// The validation benchmarks in interleaved rounds, twin of container/mion-bench/shared/rounds.mjs: a short machine
// slowdown costs one round of one competitor, not its whole run. 3 rounds of 50 ms, not 4 of 25: against one 100 ms
// window, shorter windows read low and unevenly (25 ms: 8-20%, 33 ms: 5%, 50 ms: 2-3%, inside the 4-6% two 100 ms
// runs differ by per case). Three rounds still let the median drop one slow round.

import {existsSync, readFileSync} from 'node:fs';
import {median, round2, roundFile, roundOrder, spreadPct} from '../../../container/mion-bench/shared/rounds.mjs';

export const DEFAULT_ROUNDS = 3;
// Per stream per round; the driver always passes it, so the harness default only serves a bare run.
export const DEFAULT_ROUND_MS = 50;
const STREAMS = ['validOpsSec', 'invalidOpsSec', 'mixedOpsSec'];

/** Throws on a value that would schedule no round. */
export function validationPlan(env = process.env) {
  const rounds = env.MION_VALIDATION_BENCH_ROUNDS ? Number(env.MION_VALIDATION_BENCH_ROUNDS) : DEFAULT_ROUNDS;
  const timeMs = env.MION_VALIDATION_BENCH_TIME_MS ? Number(env.MION_VALIDATION_BENCH_TIME_MS) : DEFAULT_ROUND_MS;
  if (!Number.isInteger(rounds) || rounds < 1) throw new Error(`bench: MION_VALIDATION_BENCH_ROUNDS must be a whole number of 1 or more, got '${env.MION_VALIDATION_BENCH_ROUNDS}'`);
  if (!(timeMs > 0)) throw new Error(`bench: MION_VALIDATION_BENCH_TIME_MS must be above 0, got '${env.MION_VALIDATION_BENCH_TIME_MS}'`);
  return {rounds, timeMs};
}

/** Each round runs every lane, its start rotated so no lane is always first. */
export function validationSchedule(lanes, rounds) {
  const steps = [];
  for (let round = 1; round <= rounds; round++) for (const lane of roundOrder(lanes, round, rounds)) steps.push({round, lane});
  return steps;
}

/** A round's result file, beside the canonical one in a subdir the results reader never lists. */
export const validationRoundFile = roundFile;

/** One round for runs nobody publishes: quick, correctness-only and one-case inspection runs. */
export function roundsEnv(env) {
  if (env.MION_VALIDATION_BENCH_ROUNDS) return {};
  if (env.MION_VALIDATION_BENCH_QUICK === '1' || env.MION_VALIDATION_BENCH_NO_TIMING === '1' || env.MION_VALIDATION_BENCH_CASE) return {MION_VALIDATION_BENCH_ROUNDS: '1'};
  return {};
}

export function readValidationRounds(dir, competitor, rounds) {
  const files = Array.from({length: rounds}, (_, i) => validationRoundFile(dir, competitor, i + 1)).filter((file) => existsSync(file));
  return files.map((file) => JSON.parse(readFileSync(file, 'utf8')));
}

const rank = {errored: 3, fail: 2, 'not-supported': 1, ok: 0};

function mergeMetric(metrics) {
  const worst = metrics.reduce((a, b) => (rank[b.status] > rank[a.status] ? b : a));
  if (worst.status !== 'ok') return {...worst};
  const merged = {status: 'ok', detail: null};
  for (const stream of STREAMS) merged[stream] = median(metrics.map((metric) => metric[stream]));
  if (metrics.length > 1) {
    merged.rounds = Object.fromEntries(STREAMS.map((stream) => [stream, metrics.map((metric) => metric[stream])]));
    const spreads = STREAMS.map((stream) => metrics.map((metric) => metric[stream])).filter((values) => values.every((value) => value > 0));
    merged.spread = spreads.length ? round2(Math.max(...spreads.map(spreadPct))) : 0;
  }
  return merged;
}

const emptySummary = () => ({ok: 0, fail: 0, errored: 0, notSupported: 0});
const bump = (summary, status) => {
  if (status === 'not-supported') summary.notSupported++;
  else summary[status]++;
};

/** Same shape shared/harness/result.ts writes. */
export function mergeValidationRounds(results) {
  if (results.length === 0) throw new Error('mergeValidationRounds: no rounds to merge');
  const sorted = [...results].sort((a, b) => a.env.round - b.env.round);
  const [first] = sorted;
  const byKey = sorted.map((result) => new Map(result.cases.map((entry) => [entry.key, entry])));
  const validate = emptySummary();
  const validationErrors = emptySummary();
  const cases = first.cases.map((entry) => {
    const all = byKey.map((cases) => cases.get(entry.key)).filter(Boolean);
    const merged = {...entry, validate: mergeMetric(all.map((one) => one.validate)), validationErrors: mergeMetric(all.map((one) => one.validationErrors))};
    bump(validate, merged.validate.status);
    bump(validationErrors, merged.validationErrors.status);
    return merged;
  });
  const {round: _round, ...env} = first.env;
  return {
    ...first,
    generatedAt: sorted.at(-1).generatedAt,
    env: {...env, rounds: sorted.length},
    cases,
    summary: {
      total: first.summary.total,
      validate,
      validationErrors,
      fail: validate.fail + validationErrors.fail,
      errored: validate.errored + validationErrors.errored,
    },
  };
}
