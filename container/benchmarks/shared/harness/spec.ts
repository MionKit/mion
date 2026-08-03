// JSON Schema spec-conformance collector.
//
// The sibling audit.ts measures every competitor against the SHARED samples,
// which are the ts-runtypes-authored truth — so ts-runtypes is the reference and
// reads 0 by construction. That is the right model for "does this library agree
// with us", and the wrong one for "do we read the dialect correctly".
//
// This collector inverts it. The samples in shared/cases/json-schema-spec are
// labelled by the SPEC, and every library, ts-runtypes included, is measured
// against those labels. A non-zero ts-runtypes cell is a conformance bug in our
// own door, which is the entire point.
//
// Only libraries that CONSUME a schema document can take part: today that is
// ts-runtypes (runTypeFromJsonSchema) and ajv. TypeBox's compiler dispatches on
// its own Kind symbol and refuses a plain document (its Schema.Compile entry
// point is unreleased), and zod and typia have no document input at all.
//
// Same per-competitor process model as the bench and the audit: each competitor's
// built bundle runs this in its own process, so the ts-runtypes build-time
// transform has already produced real validators. Gated behind
// RT_SPEC_CONFORMANCE=1 via maybeSpecConformance() so it never perturbs a normal run.

import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {iterateSpecCases} from '../cases/json-schema-spec/index.ts';
import {reprValue} from './repr.ts';

/** One value whose verdict disagrees with the spec label. */
export interface SpecFailure {
  /** 'accept' = the spec says valid, 'reject' = the spec says invalid. */
  path: 'accept' | 'reject';
  sampleIndex: number;
  valueRepr: string;
  /** What the library actually returned (a throw is recorded as false). */
  got: boolean;
  threw: boolean;
}

export interface SpecCaseResult {
  key: string;
  group: string;
  name: string;
  title: string;
  description?: string;
  /** Distinct samples whose verdict disagreed with the spec. 0 = conforms. */
  divergences: number;
  failures: SpecFailure[];
  /** Set when the validator could not be built at all (the document was refused). */
  buildError?: string;
}

export interface SpecResult {
  competitor: string;
  generatedAt: string;
  cases: SpecCaseResult[];
  totals: {cases: number; samplesChecked: number; conforming: number; diverging: number; buildErrors: number};
}

export type SpecCases = Record<string, () => (value: unknown) => boolean>;

// A throw counts as a rejection, the same rule the bench and the audit use.
function callBool(validator: (value: unknown) => boolean, sample: unknown): {got: boolean; threw: boolean} {
  try {
    return {got: validator(sample) === true, threw: false};
  } catch {
    return {got: false, threw: true};
  }
}

export function runSpecConformance(competitor: string, cases: SpecCases): SpecResult {
  const results: SpecCaseResult[] = [];
  let samplesChecked = 0;
  let buildErrors = 0;

  for (const iterated of iterateSpecCases()) {
    const base = {
      key: iterated.key,
      group: iterated.group,
      name: iterated.name,
      title: iterated.case.title,
      description: iterated.case.description,
    };
    const build = cases[iterated.key];
    if (!build) {
      // An absent entry is a hole in the corpus mirror, not a pass: record it as a
      // build error so the cell cannot quietly read 0.
      buildErrors++;
      results.push({...base, divergences: 0, failures: [], buildError: 'no entry for this case'});
      continue;
    }
    let validator: (value: unknown) => boolean;
    try {
      validator = build();
    } catch (err) {
      buildErrors++;
      results.push({...base, divergences: 0, failures: [], buildError: err instanceof Error ? err.message : String(err)});
      continue;
    }

    const failures: SpecFailure[] = [];
    for (const [path, samples, expected] of [
      ['accept', iterated.case.valid, true],
      ['reject', iterated.case.invalid, false],
    ] as const) {
      for (let i = 0; i < samples.length; i++) {
        const {got, threw} = callBool(validator, samples[i]);
        samplesChecked++;
        if (got !== expected) failures.push({path, sampleIndex: i, valueRepr: reprValue(samples[i]), got, threw});
      }
    }
    results.push({...base, divergences: failures.length, failures});
  }

  const diverging = results.filter((r) => r.divergences > 0).length;
  return {
    competitor,
    generatedAt: new Date().toISOString(),
    cases: results,
    totals: {
      cases: results.length,
      samplesChecked,
      conforming: results.length - diverging - buildErrors,
      diverging,
      buildErrors,
    },
  };
}

/** Write the per-competitor result next to the bench results. */
export function writeSpecResult(result: SpecResult): void {
  const dir = process.env.RT_BENCH_RESULTS_DIR ?? '/app/results';
  mkdirSync(dir, {recursive: true});
  const file = path.join(dir, `${result.competitor}.spec.json`);
  writeFileSync(file, JSON.stringify(result, null, 2));
  const {conforming, cases, diverging, buildErrors, samplesChecked} = result.totals;
  console.log(
    `[spec] ${result.competitor}: ${conforming}/${cases} cases conform over ${samplesChecked} samples` +
      ` (${diverging} diverging, ${buildErrors} build errors) -> ${file}`
  );
  for (const c of result.cases) {
    if (c.buildError) console.log(`[spec]   BUILD  ${c.key}: ${c.buildError}`);
    else if (c.divergences) {
      const accepts = c.failures.filter((f) => f.path === 'reject').map((f) => f.valueRepr);
      const rejects = c.failures.filter((f) => f.path === 'accept').map((f) => f.valueRepr);
      console.log(
        `[spec]   DIVERGE ${c.key}` +
          (rejects.length ? ` rejects-valid=[${rejects.join(', ')}]` : '') +
          (accepts.length ? ` accepts-invalid=[${accepts.join(', ')}]` : '')
      );
    }
  }
}

/** RT_SPEC_CONFORMANCE=1: run the corpus and exit, skipping the timing bench. */
export function maybeSpecConformance(competitor: string, cases: SpecCases): void {
  if (!process.env.RT_SPEC_CONFORMANCE) return;
  writeSpecResult(runSpecConformance(competitor, cases));
  process.exit(0);
}
