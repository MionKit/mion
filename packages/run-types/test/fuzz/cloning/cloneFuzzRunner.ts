// Autonomous clone-fuzz driver. Feeds three streams of data into every
// target's compiled `createCloneExactShapeFn<T>()` and collects oracle
// violations:
//
//   valid    createMockDataFn<T>()             → O15, O16, O17
//   extras   mutateWithExtras(valid)         → O15, O16, O17 (+ hasUnknownKeys)
//   junk     randomJunk() (type-blind)       → robustness only
//
// Every iteration runs under a seeded `Math.random` (withSeededRandom), so a
// reported violation replays exactly from its `seed`. `runCloneFuzz` is pure
// data in / report out — no test framework, no I/O — so it runs both inside
// Vitest and as a standalone long-running soak (see runCloneFuzzForDuration).

import {withSeededRandom} from '../core/seededRng.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {runFuzzLoopSync} from '../core/runLoop.ts';
import {randomJunk} from '../value/fuzzRunner.ts';
import {deepCopyValue, mutateWithExtras} from './extrasValue.ts';
import {
  checkCloneConsistency,
  checkCloneIsolation,
  checkCloneReference,
  checkCloneRobustness,
  type ClonePhase,
  type CloneFuzzTarget,
  type CloneViolation,
} from './cloneOracle.ts';

export interface CloneFuzzOptions {
  /** Base seed; the whole run is reproducible from this number. **/
  seed?: number;
  /** Iterations per target. **/
  iterations?: number;
}

export interface CloneFuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: CloneViolation[];
  /** Hard failures captured by the crash guard (core/crashGuard.ts), each with
   *  its replay seed. **/
  crashes: CrashRecord[];
  /** Duration runs only: the slowest single iteration and its zero-based round,
   *  for the soak pathology tripwire (SOAK_ITERATION_CEILING_MS). **/
  slowestIterationMs?: number;
  slowestIterationRound?: number;
}

const DEFAULT_ITERATIONS = 200;

/** Run a fixed number of iterations per target and return all violations. **/
export function runCloneFuzz(targets: CloneFuzzTarget[], options: CloneFuzzOptions = {}): CloneFuzzReport {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const violations: CloneViolation[] = [];
  // One round per TARGET, `iterations` guarded steps inside it (see runFuzz).
  const loop = runFuzzLoopSync<CloneViolation>({seed: options.seed, defaultSeed: 0x1234abcd, rounds: targets.length}, (round) => {
    const target = targets[round.round];
    for (let i = 0; i < iterations; i++) {
      round.run(target.title, i, (iterSeed) =>
        withSeededRandom(iterSeed, () => cloneFuzzOneIteration(target, iterSeed, violations))
      );
    }
  });
  return {runs: loop.runs, iterations, seed: loop.seed, violations, crashes: loop.crashes};
}

/** Soak mode: keep fuzzing until `durationMs` elapses, logging violations as
 *  they appear. Returns the accumulated report (mirrors runFuzzForDuration). **/
export function runCloneFuzzForDuration(
  targets: CloneFuzzTarget[],
  durationMs: number,
  options: CloneFuzzOptions = {},
  onViolation?: (v: CloneViolation) => void
): CloneFuzzReport {
  const violations: CloneViolation[] = [];
  // One ROUND is a full pass over every target (see runFuzzForDuration).
  const loop = runFuzzLoopSync<CloneViolation>({seed: options.seed, durationMs, violations, onViolation}, (round) => {
    for (const target of targets) {
      round.run(target.title, round.round, (iterSeed) =>
        withSeededRandom(iterSeed, () => cloneFuzzOneIteration(target, iterSeed, violations))
      );
    }
  });
  return {
    runs: loop.runs,
    iterations: loop.rounds,
    seed: loop.seed,
    violations,
    crashes: loop.crashes,
    slowestIterationMs: loop.slowestIterationMs,
    slowestIterationRound: loop.slowestIterationRound,
  };
}

/** One target × one seed: valid, extras, and junk passes. Runs INSIDE a
 *  `withSeededRandom` scope (mock + extras + junk all draw seeded entropy). **/
function cloneFuzzOneIteration(target: CloneFuzzTarget, seed: number, out: CloneViolation[]): void {
  // --- valid pass ---
  let valid: unknown;
  try {
    valid = target.mock();
  } catch (err) {
    // A mock generator throwing is itself a finding (broken corpus type).
    out.push({
      oracle: 'O15',
      target: target.title,
      seed,
      phase: 'valid',
      message: `mock generation threw: ${err instanceof Error ? err.message : String(err)}`,
      value: '<mock-threw>',
    });
    return;
  }
  // The clone oracles are only defined over CONFORMING values. A mock that
  // fails validate would make every check vacuous, so it is surfaced as a
  // violation here (it is really the value fuzzer's O1 ground) instead of
  // being skipped silently.
  if (!isConforming(target, valid)) {
    out.push({
      oracle: 'O15',
      target: target.title,
      seed,
      phase: 'valid',
      message: 'mock did not pass validate — the clone oracles need a conforming value',
      value: '<non-conforming-mock>',
    });
    return;
  }
  runCloneChecks(target, valid, {seed, phase: 'valid'}, out, false);

  // --- extras pass (undeclared keys injected at provably-sound positions) ---
  const extras = mutateWithExtras(target.schema, valid, Math.random);
  if (extras) {
    const ctx = {seed, phase: 'extras' as ClonePhase};
    if (!isConforming(target, extras.value)) {
      // The one-directional soundness contract of the mutator was broken —
      // a harness bug, reported loudly rather than fed to the oracles.
      out.push({
        oracle: 'O15',
        target: target.title,
        seed,
        phase: 'extras',
        message: `extras mutator broke conformance (${extras.injectedCount} injected key(s)) — mutator soundness bug`,
        value: '<non-conforming-extras>',
      });
    } else {
      runCloneChecks(target, extras.value, ctx, out, true);
    }
  }

  // --- junk pass (type-blind random data; only the robustness check applies) ---
  const junk = randomJunk(0);
  push(out, checkCloneRobustness(target, junk, {seed, phase: 'junk'}));
}

/** The O15/O16/O17 battery over one conforming value. The pre-clone snapshot
 *  is taken before ANY clone call so mutation by any of them is caught. **/
function runCloneChecks(
  target: CloneFuzzTarget,
  value: unknown,
  ctx: {seed: number; phase: ClonePhase},
  out: CloneViolation[],
  expectNoUnknownKeys: boolean
): void {
  const preSnapshot = deepCopyValue(value);
  push(out, checkCloneReference(target, value, ctx));
  push(out, checkCloneIsolation(target, value, preSnapshot, ctx));
  push(out, checkCloneConsistency(target, value, ctx, {expectNoUnknownKeys}));
}

function isConforming(target: CloneFuzzTarget, value: unknown): boolean {
  try {
    return target.validate(value) === true;
  } catch {
    return false;
  }
}

function push(out: CloneViolation[], violation: CloneViolation | null): void {
  if (violation) out.push(violation);
}
