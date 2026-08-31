// Autonomous fuzz driver. Feeds three streams of data into every target's
// validation/serialization functions and collects oracle violations:
//
//   valid    createMockDataFn<T>()        → O1, O3, O4, O5, O6, O7, O19
//   invalid  mutateToInvalid(valid)     → O2, O3, O4, O19
//   junk     randomJunk() (type-blind)  → O3, O4, O19
//
// Every iteration runs under a seeded `Math.random` (withSeededRandom), so a
// reported violation replays exactly from its `seed`. `runFuzz` is pure data
// in / report out — no test framework, no I/O — so it runs both inside Vitest
// and as a standalone long-running soak (see runFuzzForDuration).

import {withSeededRandom} from '../core/seededRng.ts';
import {type CrashRecord} from '../core/crashGuard.ts';
import {runFuzzLoopSync} from '../core/runLoop.ts';
import {mutateToInvalid} from './invalidValue.ts';
import {
  checkBinaryStable,
  checkErrorsAgree,
  checkInvalidRejected,
  checkJsonStable,
  checkUnknownKeysVariantsAgree,
  checkValidAccepted,
  checkValidateTotal,
  type FuzzTarget,
  type Violation,
} from './fuzzOracle.ts';

export interface FuzzOptions {
  /** Base seed; the whole run is reproducible from this number. **/
  seed?: number;
  /** Iterations per target. **/
  iterations?: number;
}

export interface FuzzReport {
  runs: number;
  iterations: number;
  seed: number;
  violations: Violation[];
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
export function runFuzz(targets: FuzzTarget[], options: FuzzOptions = {}): FuzzReport {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const violations: Violation[] = [];
  // One round per TARGET, `iterations` guarded steps inside it — target-major,
  // so violations still arrive grouped by target. The step label is the target
  // title, which is what makes two targets draw disjoint sequences.
  const loop = runFuzzLoopSync<Violation>({seed: options.seed, defaultSeed: 0x1234abcd, rounds: targets.length}, (round) => {
    const target = targets[round.round];
    for (let i = 0; i < iterations; i++) {
      round.run(target.title, i, (iterSeed) => withSeededRandom(iterSeed, () => fuzzOneIteration(target, iterSeed, violations)));
    }
  });
  return {runs: loop.runs, iterations, seed: loop.seed, violations, crashes: loop.crashes};
}

/** Soak mode: keep fuzzing until `durationMs` elapses, logging violations as
 *  they appear. Returns the accumulated report. Used by the standalone runner
 *  the user wants to "run autonomous for some time and log all found errors". **/
export function runFuzzForDuration(
  targets: FuzzTarget[],
  durationMs: number,
  options: FuzzOptions = {},
  onViolation?: (v: Violation) => void
): FuzzReport {
  const violations: Violation[] = [];
  // One ROUND is a full pass over every target — the budget refuses to start a
  // round the remaining time cannot pay for, so the soak lands inside its wall
  // clock instead of overshooting by a whole round.
  const loop = runFuzzLoopSync<Violation>({seed: options.seed, durationMs, violations, onViolation}, (round) => {
    for (const target of targets) {
      round.run(target.title, round.round, (iterSeed) =>
        withSeededRandom(iterSeed, () => fuzzOneIteration(target, iterSeed, violations))
      );
    }
  });
  return {
    runs: loop.runs,
    iterations: loop.rounds,
    seed: loop.seed,
    crashes: loop.crashes,
    violations,
    slowestIterationMs: loop.slowestIterationMs,
    slowestIterationRound: loop.slowestIterationRound,
  };
}

/** One target × one seed: valid, invalid, and junk passes. Runs INSIDE a
 *  `withSeededRandom` scope (mock + mutation + junk all draw seeded entropy). **/
function fuzzOneIteration(target: FuzzTarget, seed: number, out: Violation[]): void {
  // --- valid pass ---
  let valid: unknown;
  try {
    valid = target.mock();
  } catch (err) {
    // A mock generator throwing is itself a finding (e.g. `never` in a shape).
    out.push({
      oracle: 'O1',
      target: target.title,
      seed,
      phase: 'valid',
      message: `mock generation threw: ${err instanceof Error ? err.message : String(err)}`,
      value: '<mock-threw>',
    });
    return;
  }
  const validCtx = {seed, phase: 'valid' as const};
  push(out, checkValidAccepted(target, valid, validCtx));
  push(out, checkValidateTotal(target, valid, validCtx));
  push(out, checkErrorsAgree(target, valid, validCtx));
  push(out, checkJsonStable(target, valid, validCtx));
  push(out, checkBinaryStable(target, valid, validCtx));
  push(out, checkUnknownKeysVariantsAgree(target, valid, validCtx));

  // --- invalid pass (metamorphic corruption of the valid mock) ---
  const mutated = mutateToInvalid(target.schema, valid, Math.random);
  if (mutated) {
    const invalidCtx = {seed, phase: 'invalid' as const};
    push(out, checkInvalidRejected(target, mutated.value, invalidCtx));
    push(out, checkValidateTotal(target, mutated.value, invalidCtx));
    push(out, checkErrorsAgree(target, mutated.value, invalidCtx));
    push(out, checkUnknownKeysVariantsAgree(target, mutated.value, invalidCtx));
  }

  // --- junk pass (type-blind random data; only robustness oracles apply) ---
  const junk = randomJunk(0);
  const junkCtx = {seed, phase: 'junk' as const};
  push(out, checkValidateTotal(target, junk, junkCtx));
  push(out, checkErrorsAgree(target, junk, junkCtx));
  // Junk is where the arrays come from, and an array satisfying an object
  // shape is the case O19 exists for.
  push(out, checkUnknownKeysVariantsAgree(target, junk, junkCtx));
}

function push(out: Violation[], violation: Violation | null): void {
  if (violation) out.push(violation);
}

const JUNK_LEAVES: Array<() => unknown> = [
  () => 0,
  () => -1,
  () => 1.5,
  () => NaN,
  () => Infinity,
  () => '',
  () => 'a string',
  () => true,
  () => false,
  () => null,
  () => undefined,
  () => 9007199254740993n,
  () => Symbol('junk'),
  () => new Date(),
  () => new Date('invalid'),
  () => ({}),
  () => [],
  () => /regex/,
  () => new Map<unknown, unknown>([['k', 'v']]),
  () => new Set([1, 2, 3]),
  () => () => undefined,
];

/** A random, acyclic, type-blind value. Bounded depth so validators that
 *  recurse on structure can't be starved by an enormous junk tree, and never
 *  cyclic (which would be a separate, intentional hardening concern). **/
export function randomJunk(depth: number): unknown {
  if (depth >= 4 || Math.random() < 0.5) {
    return JUNK_LEAVES[Math.floor(Math.random() * JUNK_LEAVES.length)]();
  }
  if (Math.random() < 0.5) {
    const length = Math.floor(Math.random() * 4);
    const arr: unknown[] = [];
    for (let i = 0; i < length; i++) arr.push(randomJunk(depth + 1));
    return arr;
  }
  const keys = Math.floor(Math.random() * 4);
  const obj: Record<string, unknown> = {};
  for (let i = 0; i < keys; i++) obj['k' + i] = randomJunk(depth + 1);
  return obj;
}
