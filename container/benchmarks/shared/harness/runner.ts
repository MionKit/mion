// Generic per-competitor run loop. For EVERY shared case it measures up to TWO
// functions independently — the cheap boolean `validate` (entry.build) and the
// heavier `validationErrors` fn (entry.buildErrors, boolean-wrapped) — each on
// BOTH the accept (valid samples) and reject (invalid samples) paths, which
// exercise different code and have very different throughput. No competitor is
// special-cased; a thrown builder is a hard `errored` for that one metric.
//
// A case entry may be a bare builder (`() => Validator`, = validate only), the
// object form `{build?, buildErrors?, samples?}`, or NOT_SUPPORTED (both metrics
// unsupported). Omitting a builder (or NOT_SUPPORTED on it) marks THAT metric
// not-supported — e.g. zod has no cheap boolean validator, so its entries supply
// `buildErrors` only and `validate` is not-supported. A `samples` override
// REPLACES the shared samples for that path (correctness AND timing).

import {iterateCases} from '../cases/index.ts';
import {NOT_SUPPORTED, type CaseEntry, type NotSupported, type SampleOverride, type CompetitorModule, type Validator} from './types.ts';
import {check, benchOps} from './measure.ts';
import type {CaseResult, MetricResult, MetricSummary, CompetitorResult} from './result.ts';

const NO_TIMING = process.env.RT_BENCH_NO_TIMING === '1';
const TIME_MS = Number(process.env.RT_BENCH_TIME_MS ?? 100);
// RT_BENCH_CASE=<substr>: restrict the run to cases whose dotted key contains the
// (case-insensitive) substring — measure ONE case's runtime across competitors.
// A filtered run prints to the console and does NOT write <name>.json (see
// writeResult in result.ts), so it never clobbers the full-suite results.
const CASE_FILTER = (process.env.RT_BENCH_CASE ?? '').toLowerCase();

const asFn = (x: (() => Validator) | NotSupported | undefined): (() => Validator) | null => (typeof x === 'function' ? x : null);

// Collapse a case entry to its two optional builders + a sample override.
function normalize(entry: CaseEntry | undefined): {validate: (() => Validator) | null; errors: (() => Validator) | null; override: SampleOverride} {
  if (entry === NOT_SUPPORTED || entry === undefined) return {validate: null, errors: null, override: {}};
  if (typeof entry === 'function') return {validate: entry, errors: null, override: {}};
  return {validate: asFn(entry.build), errors: asFn(entry.buildErrors), override: entry.samples ?? {}};
}

const notSupported = (): MetricResult => ({status: 'not-supported', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: null});
const errored = (detail: string): MetricResult => ({status: 'errored', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail});

// Interleave valid + invalid 1:1 so the timed stream alternates accept/reject —
// the realistic mixed workload where branch prediction can't settle into one path.
function interleave(valid: unknown[], invalid: unknown[]): unknown[] {
  const out: unknown[] = [];
  const max = Math.max(valid.length, invalid.length);
  for (let i = 0; i < max; i++) {
    if (i < valid.length) out.push(valid[i]);
    if (i < invalid.length) out.push(invalid[i]);
  }
  return out;
}

// Measure one metric: build the validator, check correctness on both paths, then
// time the accept, reject, AND interleaved-mixed streams. `shared`/`sharedErr` is
// the case's sample set (computed once).
function measureMetric(builder: (() => Validator) | null, shared: {valid: unknown[]; invalid: unknown[]} | null, sharedErr: string | null, override: SampleOverride): MetricResult {
  if (builder === null) return notSupported();
  if (sharedErr !== null) return errored(sharedErr);
  let validator: Validator;
  try {
    validator = builder();
  } catch (err) {
    return errored(err instanceof Error ? err.message : String(err));
  }
  const validSamples = override.valid ?? shared!.valid;
  const invalidSamples = override.invalid ?? shared!.invalid;
  const badValid = check(validator, validSamples, true);
  if (badValid >= 0) return {status: 'fail', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: `valid[${badValid}] rejected`};
  const badInvalid = check(validator, invalidSamples, false);
  if (badInvalid >= 0) return {status: 'fail', validOpsSec: 0, invalidOpsSec: 0, mixedOpsSec: 0, detail: `invalid[${badInvalid}] accepted`};
  const mixedSamples = validSamples.length > 0 && invalidSamples.length > 0 ? interleave(validSamples, invalidSamples) : [];
  return {
    status: 'ok',
    validOpsSec: NO_TIMING ? 0 : benchOps(validator, validSamples),
    invalidOpsSec: NO_TIMING ? 0 : benchOps(validator, invalidSamples),
    mixedOpsSec: NO_TIMING || mixedSamples.length === 0 ? 0 : benchOps(validator, mixedSamples),
    detail: null,
  };
}

function bump(sum: MetricSummary, status: string): void {
  if (status === 'ok') sum.ok++;
  else if (status === 'fail') sum.fail++;
  else if (status === 'errored') sum.errored++;
  else sum.notSupported++;
}

export function runCompetitor(competitorModule: CompetitorModule): CompetitorResult {
  const cases: CaseResult[] = [];
  const validate: MetricSummary = {ok: 0, fail: 0, errored: 0, notSupported: 0};
  const validationErrors: MetricSummary = {ok: 0, fail: 0, errored: 0, notSupported: 0};
  let total = 0;

  for (const iterated of iterateCases()) {
    if (CASE_FILTER && !iterated.key.toLowerCase().includes(CASE_FILTER)) continue;
    total++;
    const base = {key: iterated.key, suite: iterated.suite, group: iterated.group, name: iterated.name};
    const norm = normalize(competitorModule.cases[iterated.key]);
    const overridden = norm.override.valid !== undefined || norm.override.invalid !== undefined;

    // Compute the case samples ONCE (shared by both metrics); a throwing
    // getSamples (e.g. Temporal with no global) makes each SUPPORTED metric errored.
    let shared: {valid: unknown[]; invalid: unknown[]} | null = null;
    let sharedErr: string | null = null;
    if (norm.validate !== null || norm.errors !== null) {
      try {
        shared = iterated.case.getSamples();
      } catch (err) {
        sharedErr = `getSamples threw: ${err instanceof Error ? err.message : String(err)}`;
      }
    }

    const validateRes = measureMetric(norm.validate, shared, sharedErr, norm.override);
    const errorsRes = measureMetric(norm.errors, shared, sharedErr, norm.override);
    bump(validate, validateRes.status);
    bump(validationErrors, errorsRes.status);
    cases.push({...base, samplesOverridden: overridden, validate: validateRes, validationErrors: errorsRes});
  }

  return {
    competitor: competitorModule.name,
    generatedAt: new Date().toISOString(),
    env: {node: process.version, timeMs: TIME_MS, noTiming: NO_TIMING},
    cases,
    summary: {
      total,
      validate,
      validationErrors,
      fail: validate.fail + validationErrors.fail,
      errored: validate.errored + validationErrors.errored,
    },
  };
}
