// Alignment-audit collector. The timing bench (runner.ts) stops at the FIRST
// sample a competitor gets wrong and, crucially, lets a competitor REPLACE the
// shared samples with its own (SampleOverride) so the cell goes green. That keeps
// the bench green by design — which means the real cross-library divergences are
// hidden behind the ~80 overrides + the NOT_SUPPORTED opt-outs.
//
// This collector exists to surface those. It evaluates every competitor's
// validator against the SHARED samples (the ts-runtypes-authored truth) — NEVER
// the competitor's own override — and walks EVERY sample on BOTH paths (accept /
// reject) for BOTH metrics (validate / validationErrors), recording each
// disagreement with the shared truth as one structured row. A row carries the
// `samplesOverridden` flag so the classifier can tell a divergence the competitor
// already DECLARED (an override exists for the case) from an undeclared one.
//
// Same per-competitor process model as the bench: each competitor's built bundle
// runs this in its own process (so the ts-runtypes / typia build-time transforms
// have already produced real validators). Gated behind RT_AUDIT_ALIGNMENT=1 via
// maybeAudit() so it never perturbs a normal run.

import {writeFileSync, mkdirSync} from 'node:fs';
import path from 'node:path';
import {iterateCases} from '../cases/index.ts';
import {
  NOT_SUPPORTED,
  METRICS,
  type CaseEntry,
  type CompetitorModule,
  type Metric,
  type SampleOverride,
  type Validator,
} from './types.ts';
import {reprValue} from './repr.ts';

export type AuditPath = 'accept' | 'reject';

/** One disagreement between a competitor's boolean output and the labelled truth,
 *  for a single (case, metric, path, sample). This is the audit's atom — every
 *  FAIL the bench shows decomposes into one or more of these. */
export interface MisalignmentRecord {
  caseKey: string;
  suite: string;
  group: string;
  name: string;
  competitor: string;
  metric: Metric;
  path: AuditPath;
  sampleIndex: number;
  sampleValueRepr: string;
  /** The SHARED labelled truth for this path: true on accept, false on reject. */
  expected: boolean;
  /** What the competitor returned (a thrown validator is recorded as false). */
  got: boolean;
  /** True when the validator threw rather than returning a boolean. */
  threw: boolean;
  /** True when the competitor carries a SampleOverride for this case — i.e. it
   *  already DECLARED a divergence here (the bench cell is green only because the
   *  override hid this exact sample). A misalignment with this false is undeclared. */
  samplesOverridden: boolean;
}

/** A builder (or getSamples) that threw before any sample could be checked — a
 *  whole-metric failure, classified separately (BUILDER_THREW) from per-sample
 *  misalignments because the cause is usually "the library can't model the type
 *  at all" rather than "it ran but disagreed". */
export interface BuilderIssue {
  caseKey: string;
  competitor: string;
  metric: Metric;
  kind: 'builder-threw' | 'getSamples-threw';
  detail: string;
}

/** A (case, metric) a competitor deliberately declared unsupported. Already a
 *  declared divergence — listed in the report, never counted as a misalignment. */
export interface NotSupportedRecord {
  caseKey: string;
  competitor: string;
  metric: Metric;
}

/** One case the competitor actually ran (at least one metric built a validator),
 *  with how many distinct samples it disagreed with the shared truth on. This is
 *  the per-case roll-up the correctness website table reads: 0 = fully aligned, a
 *  positive count = that many diverging samples. A case absent from this list was
 *  not supported (rendered n-a). */
export interface CoverageEntry {
  caseKey: string;
  suite: string;
  group: string;
  name: string;
  title: string;
  divergences: number;
}

export interface AuditResult {
  competitor: string;
  generatedAt: string;
  records: MisalignmentRecord[];
  builderIssues: BuilderIssue[];
  notSupported: NotSupportedRecord[];
  coverage: CoverageEntry[];
  totals: {
    casesScanned: number;
    samplesChecked: number;
    misalignments: number;
    builderIssues: number;
    notSupported: number;
    overrides: number;
  };
}

const asFn = (entry: unknown): (() => Validator) | null => (typeof entry === 'function' ? (entry as () => Validator) : null);

function normalize(entry: CaseEntry | undefined): {
  validate: (() => Validator) | null;
  errors: (() => Validator) | null;
  override: SampleOverride;
} {
  if (entry === NOT_SUPPORTED || entry === undefined) return {validate: null, errors: null, override: {}};
  if (typeof entry === 'function') return {validate: entry, errors: null, override: {}};
  return {validate: asFn(entry.build), errors: asFn(entry.buildErrors), override: entry.samples ?? {}};
}

// Same "a throw counts as a rejection" rule the bench's check() uses.
function callBool(validator: Validator, sample: unknown): {got: boolean; threw: boolean} {
  try {
    return {got: validator(sample) === true, threw: false};
  } catch {
    return {got: false, threw: true};
  }
}

// Walk every sample on one path for one already-built validator, emitting a record
// per disagreement.
function walkPath(
  validator: Validator,
  samples: unknown[],
  path: AuditPath,
  base: Omit<MisalignmentRecord, 'path' | 'sampleIndex' | 'sampleValueRepr' | 'expected' | 'got' | 'threw'>,
  out: MisalignmentRecord[]
): number {
  const expected = path === 'accept';
  for (let i = 0; i < samples.length; i++) {
    const {got, threw} = callBool(validator, samples[i]);
    if (got !== expected) {
      out.push({...base, path, sampleIndex: i, sampleValueRepr: reprValue(samples[i]), expected, got, threw});
    }
  }
  return samples.length;
}

export function auditCompetitor(competitorModule: CompetitorModule): AuditResult {
  const records: MisalignmentRecord[] = [];
  const builderIssues: BuilderIssue[] = [];
  const notSupported: NotSupportedRecord[] = [];
  const coverage: CoverageEntry[] = [];
  let casesScanned = 0;
  let samplesChecked = 0;
  let overrides = 0;

  for (const iterated of iterateCases()) {
    casesScanned++;
    const norm = normalize(competitorModule.cases[iterated.key]);
    const overridden = norm.override.valid !== undefined || norm.override.invalid !== undefined;
    if (overridden) overrides++;
    // Per-case coverage: did any metric run, and on how many distinct samples did
    // it diverge (a (path, sampleIndex) pair, deduped across the two metrics)?
    let ran = false;
    const divergentSamples = new Set<string>();

    // Samples are computed once per case (shared by both metrics), exactly like the bench.
    let shared: {valid: unknown[]; invalid: unknown[]} | null = null;
    let sharedErr: string | null = null;
    if (norm.validate !== null || norm.errors !== null) {
      try {
        shared = iterated.case.getSamples();
      } catch (err) {
        sharedErr = err instanceof Error ? err.message : String(err);
      }
    }

    for (const metric of METRICS) {
      const builder = metric === 'validate' ? norm.validate : norm.errors;
      if (builder === null) {
        notSupported.push({caseKey: iterated.key, competitor: competitorModule.name, metric});
        continue;
      }
      if (sharedErr !== null) {
        builderIssues.push({
          caseKey: iterated.key,
          competitor: competitorModule.name,
          metric,
          kind: 'getSamples-threw',
          detail: sharedErr,
        });
        continue;
      }
      let validator: Validator;
      try {
        validator = builder();
      } catch (err) {
        builderIssues.push({
          caseKey: iterated.key,
          competitor: competitorModule.name,
          metric,
          kind: 'builder-threw',
          detail: err instanceof Error ? err.message : String(err),
        });
        continue;
      }
      // Always compare against the SHARED samples (the ts-runtypes truth), never
      // the competitor's override — surfacing exactly the divergences the override
      // would otherwise hide.
      const valid = shared!.valid;
      const invalid = shared!.invalid;
      const base = {
        caseKey: iterated.key,
        suite: iterated.suite,
        group: iterated.group,
        name: iterated.name,
        competitor: competitorModule.name,
        metric,
        samplesOverridden: overridden,
      };
      ran = true;
      const before = records.length;
      samplesChecked += walkPath(validator, valid, 'accept', base, records);
      samplesChecked += walkPath(validator, invalid, 'reject', base, records);
      for (let i = before; i < records.length; i++) divergentSamples.add(`${records[i].path}#${records[i].sampleIndex}`);
    }

    if (ran) {
      coverage.push({
        caseKey: iterated.key,
        suite: iterated.suite,
        group: iterated.group,
        name: iterated.name,
        title: iterated.case.title,
        divergences: divergentSamples.size,
      });
    }
  }

  return {
    competitor: competitorModule.name,
    generatedAt: new Date().toISOString(),
    records,
    builderIssues,
    notSupported,
    coverage,
    totals: {
      casesScanned,
      samplesChecked,
      misalignments: records.length,
      builderIssues: builderIssues.length,
      notSupported: notSupported.length,
      overrides,
    },
  };
}

const RESULTS_DIR = process.env.RT_BENCH_RESULTS_DIR ?? path.resolve(process.cwd(), '..', '..', 'results');

export function writeAudit(result: AuditResult): void {
  mkdirSync(RESULTS_DIR, {recursive: true});
  writeFileSync(path.join(RESULTS_DIR, `${result.competitor}.alignment.json`), JSON.stringify(result, null, 2) + '\n');
}

/** Called from each competitor's main.ts. When RT_AUDIT_ALIGNMENT=1 it collects the
 *  alignment records for that competitor, writes <name>.alignment.json, and exits
 *  WITHOUT running the timing bench — so the same built bundle serves both modes. */
export function maybeAudit(name: string, cases: CompetitorModule['cases']): void {
  if (process.env.RT_AUDIT_ALIGNMENT !== '1') return;
  const result = auditCompetitor({name, cases});
  writeAudit(result);
  const {misalignments, builderIssues, notSupported, samplesChecked} = result.totals;
  console.log(
    `[audit] ${name}: ${misalignments} misalignment(s), ${builderIssues} builder issue(s), ${notSupported} not-supported metric(s) over ${samplesChecked} sample checks`
  );
  process.exit(0);
}
