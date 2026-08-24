// The contract EVERY competitor satisfies — including ts-runtypes, which is
// just another competitor. The runner (./runner.ts) is generic over this; it has
// zero competitor-specific branches.

import type {CaseKey} from '../cases/index.ts';

export type Validator = (value: unknown) => boolean;

/** A competitor deliberately does not support a case. Rendered "—" in the table,
 *  never counted as a failure. */
export const NOT_SUPPORTED = 'not-supported' as const;
export type NotSupported = typeof NOT_SUPPORTED;

/** Optional per-competitor sample override for a single case. The benchmark
 *  validates BOTH paths (valid = accepted, invalid = rejected) and measures each
 *  path's throughput SEPARATELY. The shared case samples were authored for
 *  ts-runtypes' semantics; when a competitor's accept/reject set genuinely
 *  differs, it may replace either array here. A provided field REPLACES the
 *  shared samples for that path (used for BOTH correctness and timing); omit a
 *  field to keep the shared samples for that path. Keep both paths non-empty and
 *  representative, and add a one-line reason at the call site. */
export interface SampleOverride {
  valid?: unknown[];
  invalid?: unknown[];
}

/** Every case is measured on up to TWO functions, each independently
 *  supported/overridable:
 *   - `build`        → the CHEAP boolean validator (ts-go `createValidateFn`,
 *                      typebox `.Check`, ajv default `validate`, typia `createIs`).
 *   - `buildErrors`  → the VALIDATION-ERRORS function (ts-go `createGetValidationErrorsFn`,
 *                      typebox `.Errors`, ajv `allErrors:true`, typia `createValidateFn`,
 *                      zod `safeParse`), wrapped to a boolean (true = no errors) so the
 *                      runner can check correctness + time it identically. This path is
 *                      meant to run only after `validate` fails, so it is much heavier.
 *  Omit (or set NOT_SUPPORTED on) either function to mark THAT metric not-supported
 *  for the case — independently. e.g. zod has no cheap boolean validator, so its
 *  entries provide `buildErrors` only and `validate` is not-supported. A builder that
 *  THROWS is recorded as a hard `errored` for that metric. */
export interface CaseBuilder {
  build?: (() => Validator) | NotSupported;
  buildErrors?: (() => Validator) | NotSupported;
  samples?: SampleOverride;
}

/** What a competitor declares PER CASE: a bare LAZY builder (shorthand for
 *  `{build: fn}` — the cheap validate only), OR the object form `{build?,
 *  buildErrors?, samples?}`, OR the explicit opt-out (both metrics unsupported). */
export type CaseEntry = (() => Validator) | CaseBuilder | NotSupported;

/** The two metrics measured per case. */
export type Metric = 'validate' | 'validationErrors';
export const METRICS: readonly Metric[] = ['validate', 'validationErrors'];

/** A competitor's cases as a TOTAL map over every shared case key, so TS fails
 *  the build if a case is unhandled. This is the "function OR explicit
 *  not-supported, for every case" guarantee. */
export type CompetitorCases = Record<CaseKey, CaseEntry>;

export interface CompetitorModule {
  name: string;
  cases: CompetitorCases;
}
